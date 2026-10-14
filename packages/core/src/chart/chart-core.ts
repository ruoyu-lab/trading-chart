import { BarStore } from '../data/bar-store';
import type { BarInput } from '../data/types';
import { EventBus } from '../events/event-bus';
import { Formatter, inferPrecision } from '../format/formatter';
import { createIndicatorRegistry } from '../indicators/built-in';
import { IndicatorStore } from '../indicators/indicator-store';
import type { IndicatorInput } from '../indicators/types';
import { createDefaultOptions } from '../options/defaults';
import { resolveOptions, type ChartOptionsInput } from '../options/resolve';
import type { ChartOptions } from '../options/types';
import { MAIN_PANE_ID, PaneStore } from '../panes/pane-store';
import { font } from '../canvas/canvas';
import { paintCursor } from '../render/cursor-painter';
import { BufferPool, buildFrame, formatPaneValue, type Frame } from '../render/frame';
import { paintScene } from '../render/scene-painter';
import { FrameScheduler } from '../render/scheduler';
import { Surface, type LayerName } from '../render/surface';
import { Clock } from '../format/clock';
import { TimeMarks } from '../scales/time-ticks';
import { TimeScale, type TimeScaleSettings } from '../scales/time-scale';
import { createSeriesRegistry } from '../series/built-in';
import { SeriesStore, type SeriesInput } from '../series/series-store';
import { AlertsDomain } from '../alerts/alerts-domain';
import { createDrawingRegistry } from '../drawings/built-in';
import { DrawingStore } from '../drawings/drawing-store';
import { DrawingsDomain } from '../drawings/drawings-domain';
import { InputController } from '../interaction/input-controller';
import type { DragSession, HitTarget, Point, ToolSession } from '../interaction/types';
import { ObjectsController } from '../objects/objects-controller';
import type { ObjectContext, Selection } from '../objects/types';
import { MarkersDomain } from '../trading/markers';
import { OrdersDomain, type PriceLineHost } from '../trading/orders';
import type { BarChange } from '../data/types';
import { fail } from '../utils/errors';
import { buildCursorView, crosshairAt, type CrosshairState } from './cursor';
import type { ChartEventMap } from './events';
import { createInteractionHost } from './interaction-host';
import { createValueReader } from './value-reader';

const COUNTDOWN_INTERVAL_MS = 1000;
const PRECISION_SAMPLE = 500;

function timeScaleSettings(options: ChartOptions): TimeScaleSettings {
  return {
    minBarSpacing: options.timeScale.minBarSpacing,
    maxBarSpacing: options.timeScale.maxBarSpacing,
    rightOffset: options.timeScale.rightOffset
  };
}

/**
 * Owns every model of one chart and the single update path: mutations invalidate, the scheduler
 * repaints in the next animation frame, and events are dispatched after each operation completes.
 */
export class ChartCore {
  readonly bus = new EventBus<ChartEventMap>();
  readonly bars = new BarStore();
  readonly seriesTypes = createSeriesRegistry();
  readonly series = new SeriesStore(this.seriesTypes);
  readonly indicators = new IndicatorStore(this.bars, createIndicatorRegistry());
  readonly surface: Surface;
  readonly timeScale: TimeScale;
  readonly panes: PaneStore;
  readonly objects: ObjectsController;
  readonly drawings: DrawingsDomain;
  readonly orders: OrdersDomain;
  readonly markers = new MarkersDomain();
  readonly alerts: AlertsDomain;
  private readonly input: InputController;
  private currentOptions: ChartOptions;
  private formatterValue: Formatter;
  private marks: TimeMarks;
  private readonly scheduler: FrameScheduler;
  private readonly pool = new BufferPool();
  private frameValue: Frame | null = null;
  private geometryDirty = true;
  private axisWidth = 0;
  private precisionCache = { revision: -1, value: 2 };
  private pointer: { x: number; y: number } | null = null;
  private crosshairValue: CrosshairState | null = null;
  private externalCrosshair: { time: number; price: number | null; paneId: string } | null = null;
  private crosshairDirty = false;
  private crosshairFromPointer = false;
  private crosshairFrame: Frame | null = null;
  private lastVisibleKey = '';
  private loadMoreArmed = true;
  private loadMoreFirstTime = Number.NaN;
  private countdownTimer = 0;
  private destroyed = false;

  constructor(
    readonly view: Window,
    container: HTMLElement,
    options: ChartOptionsInput | undefined
  ) {
    this.currentOptions = resolveOptions(createDefaultOptions(), options);
    this.seriesTypes.require(this.currentOptions.mainSeries.type);
    this.formatterValue = new Formatter(this.currentOptions.locale, this.currentOptions.timeZone);
    this.marks = new TimeMarks(this.bars, this.formatterValue.clock);
    this.timeScale = new TimeScale(
      timeScaleSettings(this.currentOptions),
      this.currentOptions.timeScale.barSpacing
    );
    this.panes = new PaneStore(
      this.currentOptions.panes.defaultHeight,
      this.currentOptions.priceScale.margins
    );
    this.surface = new Surface(
      view,
      container,
      this.currentOptions.performance.maxPixelRatio,
      () => {
        this.run(() => {
          this.invalidate();
        });
        // Resizing cleared the canvases; repaint before the browser shows them.
        this.scheduler.flush();
      }
    );
    this.scheduler = new FrameScheduler(view, (layers) => {
      this.paint(layers);
    });
    this.drawings = new DrawingsDomain(new DrawingStore(createDrawingRegistry()), {
      context: () => this.objectContext(),
      repaint: () => {
        this.invalidateLayers('objects');
      },
      formatValue: (pane, value) => formatPaneValue(this, pane, value),
      changed: (reason, ids) => {
        this.bus.emit('drawingsChange', { reason, ids });
      },
      toolEnded: () => {
        this.bus.emit('toolChange', { tool: null });
      },
      selected: (id) => {
        this.selectByUser(id === null ? null : { kind: 'drawing', id });
      }
    });
    const priceLines: PriceLineHost = {
      context: () => this.objectContext(),
      repaint: () => {
        this.invalidateLayers('objects');
      },
      formatValue: (pane, value) => formatPaneValue(this, pane, value),
      precision: (pane) => (pane.format.kind === 'decimal' ? pane.format.precision : 0),
      dragged: (event) => {
        this.bus.emit('orderDrag', event);
      }
    };
    this.orders = new OrdersDomain(priceLines);
    this.alerts = new AlertsDomain(this.bars, {
      ...priceLines,
      dragged: (event) => {
        this.bus.emit('alertDrag', event);
      },
      reader: createValueReader(this.bars, this.indicators, this.series),
      triggered: (event) => {
        this.invalidateLayers('objects');
        this.bus.emit('alertTrigger', event);
      }
    });
    this.objects = new ObjectsController([this.markers, this.drawings, this.alerts, this.orders]);
    this.input = new InputController(createInteractionHost(this), view);
    this.axisWidth = this.currentOptions.priceScale.minWidth;
    const size = this.surface.measureContainer();
    this.surface.resize(size.width, size.height);
    this.surface.setAutoSize(this.currentOptions.autoSize);
    this.surface.watchPixelRatio();
    this.syncCountdown();
    this.invalidate();
  }

  get options(): ChartOptions {
    return this.currentOptions;
  }

  get formatter(): Formatter {
    return this.formatterValue;
  }

  /** The crosshair as of the current geometry. */
  get crosshair(): CrosshairState | null {
    this.syncCrosshair(this.frame());
    return this.crosshairValue;
  }

  // ─── Operations ────────────────────────────────────────────────────────────

  /** Runs an API operation: events it emits are dispatched once it completes. */
  run<T>(operation: () => T): T {
    if (this.destroyed) {
      fail('The chart has been destroyed.');
    }

    return this.bus.defer(operation);
  }

  applyOptions(patch: ChartOptionsInput): void {
    const previous = this.currentOptions;
    const next = resolveOptions(previous, patch);
    this.seriesTypes.require(next.mainSeries.type);
    this.currentOptions = next;

    if (next.locale !== previous.locale || next.timeZone !== previous.timeZone) {
      this.formatterValue = new Formatter(next.locale, next.timeZone);
      this.marks = new TimeMarks(this.bars, new Clock(next.timeZone));
    }

    this.timeScale.configure(timeScaleSettings(next));

    if (next.timeScale.barSpacing !== previous.timeScale.barSpacing) {
      this.timeScale.setBarSpacing(next.timeScale.barSpacing);
    }

    this.panes.configure(next.panes.defaultHeight, next.priceScale.margins);

    if (next.performance.maxPixelRatio !== previous.performance.maxPixelRatio) {
      this.surface.setMaxPixelRatio(next.performance.maxPixelRatio);
    }

    if (next.autoSize !== previous.autoSize) {
      this.surface.setAutoSize(next.autoSize);
    }

    this.precisionCache.revision = -1;
    this.syncCountdown();
    this.invalidate();
  }

  resize(width: number, height: number): void {
    if (this.surface.resize(width, height)) {
      this.invalidate();
    }
  }

  setData(bars: readonly BarInput[]): void {
    this.bars.set(bars);
    this.timeScale.setBarCount(this.bars.length, 'reset');
    this.onBarsChanged({ kind: 'reset' });
  }

  updateData(bars: readonly BarInput[]): void {
    const revision = this.bars.revision;
    this.bars.update(bars);
    const change = this.bars.changesSince(revision);

    if (change) {
      this.timeScale.setBarCount(this.bars.length, 'tail');
      this.onBarsChanged(change);
    }
  }

  prependData(bars: readonly BarInput[]): number {
    const inserted = this.bars.prepend(bars);

    if (inserted > 0) {
      this.timeScale.setBarCount(this.bars.length, 'prepend');
      this.onBarsChanged({ kind: 'reset' });
    }

    return inserted;
  }

  clearData(): void {
    this.bars.clear();
    this.timeScale.setBarCount(0, 'reset');
    this.onBarsChanged({ kind: 'reset' });
  }

  /** Creates a pane for an indicator or series placed in `new`. */
  private createAutoPane(owner: string): string {
    let id = owner;

    for (let suffix = 2; this.panes.get(id); suffix += 1) {
      id = `${owner}-${suffix}`;
    }

    this.panes.add({ id }, true);
    return id;
  }

  addIndicator(input: IndicatorInput): string {
    const requested = input.pane ?? this.indicators.defaultPane(input.type);

    if (requested !== 'new') {
      this.panes.require(requested);
    }

    const entry = this.indicators.add(input, requested === 'new' ? MAIN_PANE_ID : requested);

    if (requested === 'new') {
      this.indicators.move(entry.id, this.createAutoPane(entry.id));
    }

    this.invalidate();
    return entry.id;
  }

  removeIndicator(id: string): void {
    this.assertUnreferenced(id);
    const entry = this.indicators.remove(id);
    this.releasePane(entry.pane);
    this.invalidate();
  }

  addSeries(input: SeriesInput): string {
    const requested = input.pane ?? MAIN_PANE_ID;

    if (requested !== 'new') {
      this.panes.require(requested);
    }

    const entry = this.series.add(input, requested === 'new' ? MAIN_PANE_ID : requested);

    if (requested === 'new') {
      this.series.move(entry.id, this.createAutoPane(entry.id));
    }

    this.invalidate();
    return entry.id;
  }

  removeSeries(id: string): void {
    this.assertUnreferenced(id);
    const entry = this.series.remove(id);
    this.releasePane(entry.pane);
    this.invalidate();
  }

  /** Ids of the indicators and series drawn in a pane. */
  paneOccupants(paneId: string): string[] {
    return [
      ...this.indicators
        .list()
        .filter((entry) => entry.pane === paneId)
        .map((entry) => entry.id),
      ...this.series
        .list()
        .filter((entry) => entry.pane === paneId)
        .map((entry) => entry.id)
    ];
  }

  /** Removes a pane together with the drawings placed on it. */
  removePane(paneId: string): void {
    this.panes.remove(paneId);
    this.drawings.store.removePane(paneId);
    this.drawings.history.forgetPane(paneId);
    this.objects.prune();
  }

  /** Updates an indicator unless that would remove an output an alert reads. */
  updateIndicator(id: string, patch: Parameters<IndicatorStore['update']>[1]): void {
    this.indicators.update(id, patch, (keys) => {
      const missing = this.alerts.indicatorKeys(id).filter((use) => !keys.includes(use.key));

      if (missing.length > 0) {
        fail(
          `Indicator "${id}" would no longer produce ${missing.map((use) => `"${use.key}" (read by alert "${use.alert}")`).join(', ')}.`
        );
      }
    });

    if (patch.params !== undefined || patch.source !== undefined) {
      this.alerts.rebaseline();
    }

    this.invalidate();
  }

  /** Removes an automatically created pane once nothing is drawn in it. */
  private releasePane(paneId: string): void {
    const pane = this.panes.get(paneId);

    if (pane?.auto && this.paneOccupants(paneId).length === 0) {
      this.removePane(paneId);
    }
  }

  // ─── Crosshair ─────────────────────────────────────────────────────────────

  /**
   * Moves the crosshair to a pointer position, or hides it with `null`. The crosshair itself is
   * resolved once per frame, which also emits `crosshairMove`.
   */
  setPointer(point: { x: number; y: number } | null): void {
    this.pointer = point;
    this.externalCrosshair = null;
    this.crosshairDirty = true;
    this.crosshairFromPointer = true;
    this.invalidateLayers('cursor');
  }

  setExternalCrosshair(
    crosshair: { time: number; price: number | null; paneId: string } | null
  ): void {
    this.pointer = null;
    this.externalCrosshair = crosshair;
    this.crosshairDirty = true;
    this.crosshairFromPointer = false;
    this.invalidateLayers('cursor');
  }

  /** The crosshair for the current pointer or programmatic position in `frame`. */
  private locateCrosshair(frame: Frame): CrosshairState | null {
    if (this.pointer) {
      return crosshairAt(this, frame, this.pointer.x, this.pointer.y);
    }

    if (!this.externalCrosshair) {
      return null;
    }

    const { time, price, paneId } = this.externalCrosshair;
    const index = this.bars.indexAt(time);
    const pane = frame.panes.find((item) => item.id === paneId);

    if (index < 0 || !pane) {
      return null;
    }

    const y =
      price === null
        ? pane.plot.y + pane.plot.height / 2
        : pane.plot.y + pane.scale.valueToY(price);
    return crosshairAt(this, frame, this.timeScale.indexToX(index), y);
  }

  /** Re-resolves the crosshair when the pointer or the geometry changed. */
  private syncCrosshair(frame: Frame): void {
    if (!this.crosshairDirty && frame === this.crosshairFrame) {
      return;
    }

    const previous = this.crosshairValue;
    const next = this.locateCrosshair(frame);
    const announce = this.crosshairDirty && this.crosshairFromPointer;
    this.crosshairValue = next;
    this.crosshairFrame = frame;
    this.crosshairDirty = false;

    if (announce && (previous !== null || next !== null)) {
      this.bus.emit('crosshairMove', next ? { visible: true, ...next } : { visible: false });
    }
  }

  // ─── Objects ───────────────────────────────────────────────────────────────

  objectContext(frame: Frame = this.frame()): ObjectContext {
    return {
      frame,
      bars: this.bars,
      timeScale: this.timeScale,
      options: this.currentOptions,
      formatter: this.formatterValue,
      selection: this.objects.selection,
      hovered: this.objects.hovered,
      measureText: (text, size) => this.measureText(text, size)
    };
  }

  /** Width of `text` in CSS pixels with the chart font at `size`. */
  measureText(text: string, size: number): number {
    const ctx = this.surface.context('cursor');
    ctx.font = font(size, this.currentOptions.font.family);
    return ctx.measureText(text).width;
  }

  hitTest(point: Point): HitTarget | null {
    return this.objects.hitTest(this.objectContext(), point);
  }

  setHovered(target: HitTarget | null): void {
    if (this.objects.setHovered(target)) {
      this.invalidateLayers('objects');
    }
  }

  beginDrag(target: HitTarget, point: Point): DragSession | null {
    return this.objects.beginDrag(this.objectContext(), target, point);
  }

  /** Selection set through the API: no event. */
  select(selection: Selection | null): void {
    if (this.objects.select(selection)) {
      this.invalidateLayers('objects');
    }
  }

  /** Selection changed by the user: emits `selectionChange`. */
  selectByUser(selection: Selection | null): void {
    if (this.objects.select(selection)) {
      this.invalidateLayers('objects');
      this.bus.emit('selectionChange', { selection });
    }
  }

  activeTool(): ToolSession | null {
    return this.drawings.activeTool();
  }

  /** Escape: cancels the drawing tool, or else clears the selection. */
  escape(): void {
    if (this.drawings.activeTool()) {
      this.drawings.cancelTool();
      this.bus.emit('toolChange', { tool: null });
      return;
    }

    this.selectByUser(null);
  }

  /** Delete key: removes the selected drawing. */
  deleteSelection(): void {
    const selection = this.objects.selection;

    if (selection?.kind !== 'drawing') {
      return;
    }

    this.drawings.mutate(() => {
      this.drawings.store.remove(selection.id);
    });
    this.selectByUser(null);
    this.bus.emit('drawingsChange', { reason: 'remove', ids: [selection.id] });
  }

  undo(): void {
    this.restoreDrawings('undo');
  }

  redo(): void {
    this.restoreDrawings('redo');
  }

  private restoreDrawings(direction: 'undo' | 'redo'): void {
    if (!this.drawings.restore(direction)) {
      return;
    }

    if (this.objects.prune()) {
      this.bus.emit('selectionChange', { selection: this.objects.selection });
    }

    this.bus.emit('drawingsChange', { reason: direction, ids: [] });
  }

  // ─── Frame and painting ────────────────────────────────────────────────────

  /** Marks the geometry stale and repaints every layer. */
  invalidate(): void {
    this.geometryDirty = true;
    this.scheduler.request('scene', 'objects', 'cursor');
  }

  invalidateLayers(...layers: LayerName[]): void {
    this.scheduler.request(...layers);
  }

  /** The current frame geometry, rebuilt first when stale. */
  frame(): Frame {
    if (this.geometryDirty || !this.frameValue) {
      // Only a successful build clears the flag, so a throwing formatter is retried next time.
      this.frameValue = this.buildFrame();
      this.geometryDirty = false;
      this.axisWidth = this.frameValue.layout.axisWidth;
      this.afterGeometry();
    }

    return this.frameValue;
  }

  /** Paints pending layers synchronously. */
  flush(): void {
    this.scheduler.flush();
  }

  private buildFrame(): Frame {
    const ctx = this.surface.context('cursor');
    ctx.font = font(this.currentOptions.font.size, this.currentOptions.font.family);

    return buildFrame(
      {
        options: this.currentOptions,
        formatter: this.formatterValue,
        bars: this.bars,
        timeScale: this.timeScale,
        marks: this.marks,
        panes: this.panes,
        series: this.series,
        indicators: this.indicators,
        seriesTypes: this.seriesTypes,
        pricePrecision: this.pricePrecision(),
        measureText: (text) => ctx.measureText(text).width
      },
      { width: this.surface.width, height: this.surface.height },
      this.axisWidth,
      this.pool
    );
  }

  private paint(layers: ReadonlySet<LayerName>): void {
    this.bus.defer(() => {
      const frame = this.frame();
      const ratio = this.surface.pixelRatio;

      if (layers.has('scene')) {
        paintScene(
          this.surface.begin('scene'),
          frame,
          this.currentOptions,
          ratio,
          this.timeScale.barSpacing
        );
      }

      if (layers.has('objects')) {
        this.objects.paint({
          ...this.objectContext(frame),
          ctx: this.surface.begin('objects'),
          pixelRatio: ratio
        });
      }

      if (layers.has('cursor')) {
        this.syncCrosshair(frame);

        const view = buildCursorView(this, frame, this.crosshairValue, Date.now());
        paintCursor(this.surface.begin('cursor'), frame, this.currentOptions, ratio, view);
      }
    });
  }

  private afterGeometry(): void {
    const visible = this.timeScale.visibleBars();
    const key = visible ? `${this.bars.time(visible.from)}:${this.bars.time(visible.to)}` : '';

    if (key !== this.lastVisibleKey) {
      this.lastVisibleKey = key;
      const logical = this.timeScale.logicalRange();
      this.bus.emit('visibleRangeChange', {
        range: visible
          ? { from: this.bars.time(visible.from), to: this.bars.time(visible.to) }
          : null,
        logicalRange: visible ? logical : null
      });
    }

    this.checkLoadMore();
  }

  private checkLoadMore(): void {
    if (this.bars.length === 0 || this.surface.width === 0) {
      return;
    }

    const nearStart =
      this.timeScale.logicalRange().from < this.currentOptions.timeScale.loadMoreThreshold;

    if (!nearStart) {
      this.loadMoreArmed = true;
      return;
    }

    const firstTime = this.bars.time(0);

    if (this.loadMoreArmed || firstTime !== this.loadMoreFirstTime) {
      this.loadMoreArmed = false;
      this.loadMoreFirstTime = firstTime;
      this.bus.emit('loadMore', { before: firstTime });
    }
  }

  private onBarsChanged(change: BarChange): void {
    this.alerts.evaluate(change);
    this.syncCountdown();
    this.invalidate();
  }

  /** Fails when alerts still read an indicator or series that is about to be removed. */
  private assertUnreferenced(id: string): void {
    const alerts = this.alerts.references(id);

    if (alerts.length > 0) {
      fail(
        `"${id}" is used by the alerts ${alerts.map((alert) => `"${alert}"`).join(', ')}; remove them first.`
      );
    }
  }

  private pricePrecision(): number {
    const configured = this.currentOptions.priceScale.precision;

    if (configured !== 'auto') {
      return configured;
    }

    if (this.precisionCache.revision !== this.bars.revision) {
      const bars = this.bars;
      const start = Math.max(0, bars.length - PRECISION_SAMPLE);
      const values: number[] = [];

      for (let index = start; index < bars.length; index += 1) {
        values.push(bars.open(index), bars.high(index), bars.low(index), bars.close(index));
      }

      this.precisionCache = {
        revision: bars.revision,
        value: values.length ? Math.max(2, inferPrecision(values)) : 2
      };
    }

    return this.precisionCache.value;
  }

  private syncCountdown(): void {
    const needed = this.currentOptions.latestPrice.countdown && this.bars.length > 1;

    if (needed && this.countdownTimer === 0) {
      this.countdownTimer = this.view.setInterval(() => {
        this.invalidateLayers('cursor');
      }, COUNTDOWN_INTERVAL_MS);
    } else if (!needed && this.countdownTimer !== 0) {
      this.view.clearInterval(this.countdownTimer);
      this.countdownTimer = 0;
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    // Listeners are dropped first, so cancelling a gesture in progress notifies nobody.
    this.bus.clear();

    try {
      this.input.destroy();
    } finally {
      this.destroyed = true;
      this.scheduler.destroy();

      if (this.countdownTimer !== 0) {
        this.view.clearInterval(this.countdownTimer);
      }

      this.surface.destroy();
    }
  }
}
