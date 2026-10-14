import type { BarStore } from '../data/bar-store';
import type { Formatter } from '../format/formatter';
import { finerFormat, formatValue, type ValueFormat } from '../format/value-format';
import type { IndicatorEntry, IndicatorStore } from '../indicators/indicator-store';
import { computeLayout, type Layout, type Rect } from '../layout/layout';
import type { ChartOptions, TimeUnit } from '../options/types';
import { MAIN_PANE_ID, type PaneEntry, type PaneStore } from '../panes/pane-store';
import { emptyExtents, includeValue, type Extents, type PriceScale } from '../scales/price-scale';
import { buildPriceTicks } from '../scales/price-ticks';
import { buildTimeTicks, type TimeMarks } from '../scales/time-ticks';
import type { TimeScale } from '../scales/time-scale';
import type { SeriesEntry, SeriesStore } from '../series/series-store';
import { PointBuffer, type SeriesTypeDefinition } from '../series/types';
import { fail } from '../utils/errors';
import { deepMerge } from '../utils/merge';
import type { Registry } from '../utils/registry';
import { withAlpha } from '../canvas/color';

const AXIS_PADDING = 10;
/** Absurd labels (e.g. an extreme manual zoom) are clipped rather than squeezing the plot. */
const MAX_AXIS_WIDTH = 160;
const TICK_SPACING_FACTOR = 2.6;

export type PlotJob =
  | {
      readonly kind: 'series';
      readonly definition: SeriesTypeDefinition<object>;
      readonly style: object;
      readonly points: PointBuffer;
    }
  | {
      readonly kind: 'fill';
      readonly color: string;
      readonly from: PointBuffer;
      readonly to: PointBuffer;
    }
  | { readonly kind: 'level'; readonly y: number; readonly color: string };

export interface PriceLabel {
  readonly y: number;
  readonly text: string;
}

export interface PaneFrame {
  readonly id: string;
  readonly entry: PaneEntry;
  readonly plot: Rect;
  readonly axis: Rect;
  readonly scale: PriceScale;
  readonly format: ValueFormat;
  readonly ticks: readonly PriceLabel[];
  readonly jobs: readonly PlotJob[];
}

export interface TimeLabel {
  readonly x: number;
  readonly text: string;
  readonly unit: TimeUnit;
}

export interface LatestPrice {
  readonly value: number;
  readonly y: number;
  readonly up: boolean;
  readonly text: string;
}

export interface Frame {
  readonly layout: Layout;
  /** Integer indices of the bars intersecting the plot, or `null`. */
  readonly visible: { readonly from: number; readonly to: number } | null;
  readonly timeTicks: readonly TimeLabel[];
  readonly panes: readonly PaneFrame[];
  readonly main: PaneFrame;
  readonly priceFormat: ValueFormat;
  readonly latest: LatestPrice | null;
}

export interface FrameSources {
  readonly options: ChartOptions;
  readonly formatter: Formatter;
  readonly bars: BarStore;
  readonly timeScale: TimeScale;
  readonly marks: TimeMarks;
  readonly panes: PaneStore;
  readonly series: SeriesStore;
  readonly indicators: IndicatorStore;
  readonly seriesTypes: Registry<SeriesTypeDefinition<object>>;
  readonly pricePrecision: number;
  measureText(text: string): number;
}

/** A source of values drawn in one pane. */
interface Contributor {
  readonly pane: string;
  readonly format: ValueFormat;
  include(extents: Extents): void;
  firstValue(): number | null;
  emit(scale: PriceScale, jobs: PlotJob[]): void;
}

function styleFor(
  definition: SeriesTypeDefinition<object>,
  sources: FrameSources,
  color: string,
  overrides: object | undefined
): object {
  return deepMerge<object>(definition.defaultStyle(sources.options.theme, color), overrides);
}

/** Palette color `index`, cycling through the (never empty) palette. */
export function paletteColor(palette: readonly string[], index: number): string {
  return palette[index % palette.length] ?? fail('The theme palette is empty.');
}

/** Owns the point buffers of every plotted line between frames. */
export class BufferPool {
  private buffers = new Map<string, PointBuffer>();
  private used = new Set<string>();

  take(key: string): PointBuffer {
    this.used.add(key);
    let buffer = this.buffers.get(key);

    if (!buffer) {
      buffer = new PointBuffer();
      this.buffers.set(key, buffer);
    }

    return buffer;
  }

  /** Drops the buffers not taken since the previous call. */
  sweep(): void {
    for (const key of this.buffers.keys()) {
      if (!this.used.has(key)) {
        this.buffers.delete(key);
      }
    }

    this.used = new Set();
  }
}

class MainContributor implements Contributor {
  readonly pane = MAIN_PANE_ID;

  constructor(
    private readonly sources: FrameSources,
    private readonly range: { from: number; to: number },
    readonly format: ValueFormat,
    private readonly pool: BufferPool
  ) {}

  private get definition(): SeriesTypeDefinition<object> {
    return this.sources.seriesTypes.require(this.sources.options.mainSeries.type);
  }

  include(extents: Extents): void {
    const { bars, options } = this.sources;
    const ohlc = this.definition.input === 'ohlc';

    for (let index = this.range.from; index <= this.range.to; index += 1) {
      if (ohlc) {
        includeValue(extents, bars.low(index));
        includeValue(extents, bars.high(index));
      } else {
        includeValue(extents, bars.price(index, options.mainSeries.source));
      }
    }
  }

  firstValue(): number | null {
    const { bars, options } = this.sources;
    return bars.price(
      this.range.from,
      this.definition.input === 'ohlc' ? 'close' : options.mainSeries.source
    );
  }

  emit(scale: PriceScale, jobs: PlotJob[]): void {
    const { bars, timeScale, options } = this.sources;
    const definition = this.definition;
    const points = this.pool.take('main');
    const from = Math.max(0, this.range.from - 1);
    const to = Math.min(bars.length - 1, this.range.to + 1);
    points.reset(to - from + 1);

    for (let index = from; index <= to; index += 1) {
      const x = timeScale.indexToX(index);

      if (definition.input === 'ohlc') {
        const open = bars.open(index);
        const close = bars.close(index);
        points.pushOhlc(
          x,
          scale.valueToY(open),
          scale.valueToY(bars.high(index)),
          scale.valueToY(bars.low(index)),
          scale.valueToY(close),
          close >= open
        );
      } else {
        const value = bars.price(index, options.mainSeries.source);
        const previous = index > 0 ? bars.price(index - 1, options.mainSeries.source) : value;
        points.pushValue(x, scale.valueToY(value), value >= previous);
      }
    }

    jobs.push({
      kind: 'series',
      definition,
      style: styleFor(
        definition,
        this.sources,
        paletteColor(options.theme.palette, 0),
        options.mainSeries.styles[options.mainSeries.type]
      ),
      points
    });
  }
}

class SeriesContributor implements Contributor {
  readonly pane: string;

  constructor(
    private readonly sources: FrameSources,
    private readonly entry: SeriesEntry,
    readonly format: ValueFormat,
    private readonly color: string,
    private readonly pool: BufferPool
  ) {
    this.pane = entry.pane;
  }

  /** Index range of the series points around the visible logical range. */
  private window(): { from: number; to: number } {
    const { bars, timeScale } = this.sources;
    const range = timeScale.logicalRange();
    const store = this.entry.bars ?? this.entry.values;
    const length = store?.length ?? 0;
    const startTime = bars.timeOfLogicalIndex(Math.floor(range.from) - 1);
    const endTime = bars.timeOfLogicalIndex(Math.ceil(range.to) + 1);

    if (!store || Number.isNaN(startTime) || Number.isNaN(endTime)) {
      return { from: 0, to: -1 };
    }

    const from = store.lowerBound(startTime);
    const to = Math.min(length, store.lowerBound(endTime) + 1) - 1;
    return { from, to };
  }

  include(extents: Extents): void {
    const { from, to } = this.window();
    const { bars, values } = this.entry;

    for (let index = from; index <= to; index += 1) {
      if (bars) {
        includeValue(extents, bars.low(index));
        includeValue(extents, bars.high(index));
      } else if (values) {
        includeValue(extents, values.value(index));
      }
    }

    const style = styleFor(this.entry.definition, this.sources, this.color, this.entry.style);
    this.entry.definition.extraExtents?.(style).forEach((value) => {
      includeValue(extents, value);
    });
  }

  firstValue(): number | null {
    const { from, to } = this.window();

    if (from > to) {
      return null;
    }

    return this.entry.bars ? this.entry.bars.close(from) : (this.entry.values?.value(from) ?? null);
  }

  emit(scale: PriceScale, jobs: PlotJob[]): void {
    const { from, to } = this.window();
    const { bars: store, values } = this.entry;
    const { bars, timeScale } = this.sources;
    const points = this.pool.take(`series:${this.entry.id}`);
    points.reset(Math.max(0, to - from + 1));

    for (let index = from; index <= to; index += 1) {
      if (store) {
        const x = timeScale.indexToX(bars.logicalIndexOf(store.time(index)));
        const open = store.open(index);
        const close = store.close(index);
        points.pushOhlc(
          x,
          scale.valueToY(open),
          scale.valueToY(store.high(index)),
          scale.valueToY(store.low(index)),
          scale.valueToY(close),
          close >= open
        );
      } else if (values) {
        const x = timeScale.indexToX(bars.logicalIndexOf(values.time(index)));
        const value = values.value(index);
        const previous = index > 0 ? values.value(index - 1) : value;
        points.pushValue(x, scale.valueToY(value), !(value < previous));
      }
    }

    jobs.push({
      kind: 'series',
      definition: this.entry.definition,
      style: styleFor(this.entry.definition, this.sources, this.color, this.entry.style),
      points
    });
  }
}

class IndicatorContributor implements Contributor {
  readonly pane: string;

  constructor(
    private readonly sources: FrameSources,
    private readonly entry: IndicatorEntry,
    private readonly range: { from: number; to: number },
    readonly format: ValueFormat,
    private readonly colors: ReadonlyMap<string, string>,
    private readonly pool: BufferPool
  ) {
    this.pane = entry.pane;
  }

  include(extents: Extents): void {
    const { series, outputs, definition } = this.entry;

    outputs.forEach((output, column) => {
      if (output.plot.kind === 'hidden') {
        return;
      }

      for (let index = this.range.from; index <= this.range.to; index += 1) {
        includeValue(extents, series.value(column, index));
      }

      if (output.plot.kind === 'histogram') {
        includeValue(extents, 0);
      }
    });

    if (definition.range) {
      includeValue(extents, definition.range.min);
      includeValue(extents, definition.range.max);
    }
  }

  firstValue(): number | null {
    const value = this.entry.series.value(0, this.range.from);
    return Number.isNaN(value) ? null : value;
  }

  emit(scale: PriceScale, jobs: PlotJob[]): void {
    const { series, outputs, definition, params, id } = this.entry;
    const { bars, timeScale, options, seriesTypes } = this.sources;
    const theme = options.theme;
    const from = Math.max(0, this.range.from - 1);
    const to = Math.min(bars.length - 1, this.range.to + 1);
    const buffers = new Map<string, PointBuffer>();

    outputs.forEach((output, column) => {
      if (output.plot.kind === 'hidden') {
        return;
      }

      const points = this.pool.take(`indicator:${id}:${output.key}`);
      points.reset(to - from + 1);

      for (let index = from; index <= to; index += 1) {
        const value = series.value(column, index);
        let up: boolean;

        if (output.plot.kind === 'histogram' && output.plot.colorBy === 'bar') {
          up = bars.close(index) >= bars.open(index);
        } else if (output.plot.kind === 'histogram' && output.plot.colorBy === 'sign') {
          up = value >= 0;
        } else {
          up = !(value < series.value(column, index - 1));
        }

        points.pushValue(timeScale.indexToX(index), scale.valueToY(value), up);
      }

      buffers.set(output.key, points);
    });

    definition.fills?.forEach((fill) => {
      const fromBuffer = buffers.get(fill.from);
      const toBuffer = buffers.get(fill.to);

      if (fromBuffer && toBuffer) {
        jobs.push({
          kind: 'fill',
          color: withAlpha(this.colors.get(fill.from) ?? theme.textMuted, 0.08),
          from: fromBuffer,
          to: toBuffer
        });
      }
    });

    definition.levels?.(params).forEach((level) => {
      const y = scale.valueToY(level);

      if (Number.isFinite(y)) {
        jobs.push({ kind: 'level', y, color: withAlpha(theme.textMuted, 0.6) });
      }
    });

    outputs.forEach((output) => {
      const points = buffers.get(output.key);

      if (!points) {
        return;
      }

      if (output.plot.kind === 'histogram') {
        const sign = output.plot.colorBy !== 'bar';
        jobs.push({
          kind: 'series',
          definition: seriesTypes.require('columns'),
          style: {
            upColor: sign ? theme.up : theme.volumeUp,
            downColor: sign ? theme.down : theme.volumeDown,
            base: 0,
            widthRatio: 0.6
          },
          points
        });
      } else if (output.plot.kind === 'line') {
        jobs.push({
          kind: 'series',
          definition: seriesTypes.require('line'),
          style: {
            color: this.colors.get(output.key) ?? theme.text,
            lineWidth: 1.25,
            lineStyle: output.plot.style ?? 'solid'
          },
          points
        });
      }
    });
  }
}

/** Colors of the indicator outputs: explicit overrides, then fixed colors, then the palette. */
export function indicatorColors(
  entry: IndicatorEntry,
  palette: readonly string[]
): Map<string, string> {
  const colors = new Map<string, string>();
  let next = 0;

  for (const output of entry.outputs) {
    const explicit = entry.colors[output.key] ?? output.color;

    if (explicit) {
      colors.set(output.key, explicit);
    } else if (output.plot.kind !== 'histogram') {
      colors.set(output.key, paletteColor(palette, next));
      next += 1;
    }
  }

  return colors;
}

export function indicatorFormat(entry: IndicatorEntry, priceFormat: ValueFormat): ValueFormat {
  const precision = entry.definition.precision;

  if (precision === 'price') {
    return priceFormat;
  }

  return precision === 'volume' ? { kind: 'compact' } : { kind: 'decimal', precision };
}

/** Formats a price-axis value of a pane, honouring percent and indexed scales. */
export function formatPaneValue(
  sources: Pick<FrameSources, 'options' | 'formatter'>,
  pane: Pick<PaneFrame, 'id' | 'scale' | 'format'>,
  value: number
): string {
  const { scale } = pane;
  const display = scale.displayValue(value);
  const mode = scale.mode;
  const custom = sources.options.priceScale.formatter;
  const precision = pane.format.kind === 'decimal' ? pane.format.precision : 0;

  if (custom) {
    return custom(display, { paneId: pane.id, mode, precision, locale: sources.formatter.locale });
  }

  if (mode === 'percent') {
    return `${formatValue(sources.formatter, display, { kind: 'decimal', precision: 2 })}%`;
  }

  if (mode === 'indexed') {
    return formatValue(sources.formatter, display, { kind: 'decimal', precision: 2 });
  }

  return formatValue(sources.formatter, display, pane.format);
}

function collectContributors(
  sources: FrameSources,
  range: { from: number; to: number },
  priceFormat: ValueFormat,
  pool: BufferPool
): Contributor[] {
  const { options } = sources;
  const palette = options.theme.palette;
  const contributors: Contributor[] = [new MainContributor(sources, range, priceFormat, pool)];

  sources.series.list().forEach((entry, index) => {
    if (entry.visible) {
      const color = paletteColor(palette, index + 1);
      contributors.push(new SeriesContributor(sources, entry, priceFormat, color, pool));
    }
  });

  sources.indicators.list().forEach((entry) => {
    if (entry.visible) {
      entry.series.sync();
      contributors.push(
        new IndicatorContributor(
          sources,
          entry,
          range,
          indicatorFormat(entry, priceFormat),
          indicatorColors(entry, palette),
          pool
        )
      );
    }
  });

  return contributors;
}

function measureAxis(
  sources: FrameSources,
  panes: readonly PaneFrame[],
  latest: LatestPrice | null
): number {
  let widest = 0;

  for (const pane of panes) {
    for (const tick of pane.ticks) {
      widest = Math.max(widest, sources.measureText(tick.text));
    }
  }

  if (latest) {
    widest = Math.max(widest, sources.measureText(latest.text));
  }

  return Math.min(
    MAX_AXIS_WIDTH,
    Math.max(sources.options.priceScale.minWidth, Math.ceil(widest + AXIS_PADDING * 2))
  );
}

function layoutFor(
  sources: FrameSources,
  width: number,
  height: number,
  axisWidth: number
): Layout {
  const { options, panes } = sources;
  return computeLayout({
    width,
    height,
    axisWidth: options.priceScale.visible ? axisWidth : 0,
    timeAxisHeight: options.timeScale.visible ? options.timeScale.height : 0,
    separatorHeight: options.panes.separatorHeight,
    minPaneHeight: options.panes.minHeight,
    panes: panes.list().map((entry) => ({
      id: entry.id,
      height: entry.height,
      stretch: entry.id === MAIN_PANE_ID
    }))
  });
}

/**
 * Computes the geometry of one frame: layout, visible bars, fitted price scales, ticks and the
 * render-ready points of everything plotted. Painting only reads the result.
 */
export function buildFrame(
  sources: FrameSources,
  size: { width: number; height: number },
  axisWidthHint: number,
  pool: BufferPool
): Frame {
  const priceFormat: ValueFormat = { kind: 'decimal', precision: sources.pricePrecision };
  let axisWidth = axisWidthHint;
  let frame = buildPass(sources, size, axisWidth, priceFormat, pool);

  // The axis width depends on the labels, which depend on the visible range. It grows at once and
  // shrinks only by a noticeable amount, so it does not jitter while scrolling.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const needed = sources.options.priceScale.visible
      ? measureAxis(sources, frame.panes, frame.latest)
      : 0;

    if (needed <= axisWidth && needed > axisWidth - 12) {
      break;
    }

    axisWidth = needed;
    frame = buildPass(sources, size, axisWidth, priceFormat, pool);
  }

  pool.sweep();
  return frame;
}

function buildPass(
  sources: FrameSources,
  size: { width: number; height: number },
  axisWidth: number,
  priceFormat: ValueFormat,
  pool: BufferPool
): Frame {
  const { options, timeScale, bars, formatter } = sources;
  const layout = layoutFor(sources, size.width, size.height, axisWidth);
  timeScale.setWidth(layout.plotWidth);
  const visible = timeScale.visibleBars();
  const contributors = visible ? collectContributors(sources, visible, priceFormat, pool) : [];
  const panes: PaneFrame[] = [];

  for (const paneLayout of layout.panes) {
    const entry = sources.panes.require(paneLayout.id);
    const own = contributors.filter((contributor) => contributor.pane === entry.id);
    const extents = emptyExtents();
    own.forEach((contributor) => {
      contributor.include(extents);
    });
    const scale = entry.scale;
    scale.setHeight(paneLayout.plot.height);
    scale.fit(extents, own[0]?.firstValue() ?? null);
    const jobs: PlotJob[] = [];
    own.forEach((contributor) => {
      contributor.emit(scale, jobs);
    });
    const format =
      own.reduce<ValueFormat | null>(
        (current, contributor) => finerFormat(current, contributor.format),
        null
      ) ?? priceFormat;
    const pane = { id: entry.id, scale, format };
    const ticks = buildPriceTicks(scale, options.font.size * TICK_SPACING_FACTOR).map((tick) => ({
      y: tick.y,
      text: formatPaneValue(sources, pane, tick.value)
    }));
    panes.push({ ...pane, entry, plot: paneLayout.plot, axis: paneLayout.axis, ticks, jobs });
  }

  // The pane store keeps the main pane first.
  const main = panes[0] ?? fail('The layout has no main pane.');

  const timeTicks = options.timeScale.visible
    ? buildTimeTicks(timeScale, bars, sources.marks, sources.measureText('00:00') + 24)
        .map((tick) => ({
          x: tick.x,
          unit: tick.unit,
          text: options.timeScale.formatter
            ? options.timeScale.formatter(tick.time, {
                kind: 'axis',
                unit: tick.unit,
                locale: formatter.locale,
                timeZone: formatter.timeZone
              })
            : formatter.timeTick(tick.time, tick.unit)
        }))
        // Labels that would be cut off at the plot edges are dropped rather than clipped.
        .filter((tick) => {
          const half = sources.measureText(tick.text) / 2;
          return tick.x - half >= 0 && tick.x + half <= layout.plotWidth;
        })
    : [];

  return {
    layout,
    visible,
    timeTicks,
    panes,
    main,
    priceFormat,
    latest: latestPrice(sources, main)
  };
}

function latestPrice(sources: FrameSources, main: PaneFrame): LatestPrice | null {
  const { bars, options } = sources;

  if (bars.length === 0) {
    return null;
  }

  const last = bars.length - 1;
  const definition = sources.seriesTypes.require(options.mainSeries.type);
  const value =
    definition.input === 'ohlc' ? bars.close(last) : bars.price(last, options.mainSeries.source);
  const y = main.scale.valueToY(value);

  return {
    value,
    y,
    up: bars.close(last) >= bars.open(last),
    text: formatPaneValue(sources, main, value)
  };
}
