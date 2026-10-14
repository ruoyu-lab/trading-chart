import type { BarStore } from '../data/bar-store';
import type { BarChange } from '../data/types';
import type { DragSession, HitTarget, Point } from '../interaction/types';
import type { LineStyle } from '../options/types';
import { withAlpha } from '../canvas/color';
import type { PaneFrame } from '../render/frame';
import {
  paneOf,
  type ObjectContext,
  type ObjectDomain,
  type ObjectHit,
  type ObjectPaintContext
} from '../objects/types';
import type { PriceDragEvent, PriceLineHost } from '../trading/orders';
import {
  hitPriceLines,
  IconCache,
  layoutPriceLines,
  paintPriceLines,
  validateButtons,
  type PriceLineLayout,
  type PriceLineView
} from '../trading/price-line';
import { fail } from '../utils/errors';
import { checkBoolean, checkNumber, checkObject, checkOneOf, checkString } from '../utils/validate';
import type {
  Alert,
  AlertFrequency,
  AlertInput,
  AlertStatus,
  AlertTrigger,
  AlertTriggerEvent,
  ValueSource
} from './types';

const TRIGGERS = ['cross', 'cross-up', 'cross-down', 'above', 'below'] as const;
const FREQUENCIES = ['once', 'once-per-bar', 'once-per-bar-close', 'every-time'] as const;
const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
const PRICE_FIELDS = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'] as const;
const DEFAULT_SOURCE: ValueSource = { kind: 'price', field: 'close' };

/** Reads the values alerts watch. */
export interface ValueReader {
  /** Throws for unknown indicators, series or output keys. */
  check(source: ValueSource, label: string): void;
  /** Value of `source` at bar `index`; `NaN` when it has none. */
  read(source: ValueSource, index: number): number;
  /** Pane in which the source is drawn. */
  paneOf(source: ValueSource): string;
}

export interface AlertsHost extends PriceLineHost {
  readonly reader: ValueReader;
  triggered(event: AlertTriggerEvent): void;
}

interface AlertConfig {
  readonly id: string;
  readonly source: ValueSource;
  readonly trigger: AlertTrigger;
  readonly value: number | ValueSource;
  readonly frequency: AlertFrequency;
  readonly enabled: boolean;
  readonly label: string | null;
  readonly color: string | null;
  readonly lineStyle: LineStyle;
  readonly draggable: boolean;
  readonly visible: boolean;
  readonly buttons: Alert['buttons'];
}

interface AlertState {
  config: AlertConfig;
  status: AlertStatus;
  triggeredAt: number | null;
  /** Source and threshold at the previous evaluation. */
  last: number;
  lastThreshold: number;
  /** For `once-per-bar-close`: the last closed bar evaluated. */
  closedIndex: number;
}

function parseSource(source: ValueSource, label: string, reader: ValueReader): ValueSource {
  checkObject(label, source);

  switch (source.kind) {
    case 'price':
      return {
        kind: 'price',
        field:
          source.field === undefined
            ? 'close'
            : checkOneOf(`${label}.field`, source.field, PRICE_FIELDS)
      };
    case 'indicator':
      checkString(`${label}.id`, source.id);
      checkString(`${label}.key`, source.key);
      reader.check(source, label);
      return { kind: 'indicator', id: source.id, key: source.key };
    case 'series':
      checkString(`${label}.id`, source.id);
      reader.check(source, label);
      return { kind: 'series', id: source.id };
    default:
      return fail(`${label}.kind must be "price", "indicator" or "series".`);
  }
}

function parseAlert(input: AlertInput, reader: ValueReader, label = 'alert'): AlertConfig {
  checkObject(label, input);

  checkString(`${label}.id`, input.id);

  if (input.label !== undefined) {
    checkString(`${label}.label`, input.label);
  }

  return {
    id: input.id,
    source: parseSource(input.source ?? DEFAULT_SOURCE, `${label}.source`, reader),
    trigger: checkOneOf(`${label}.trigger`, input.trigger, TRIGGERS),
    value:
      typeof input.value === 'number'
        ? checkNumber(`${label}.value`, input.value)
        : parseSource(input.value, `${label}.value`, reader),
    frequency:
      input.frequency === undefined
        ? 'once'
        : checkOneOf(`${label}.frequency`, input.frequency, FREQUENCIES),
    enabled: input.enabled === undefined ? true : checkBoolean(`${label}.enabled`, input.enabled),
    label: input.label ?? null,
    color: input.color === undefined ? null : checkString(`${label}.color`, input.color),
    lineStyle:
      input.lineStyle === undefined
        ? 'solid'
        : checkOneOf(`${label}.lineStyle`, input.lineStyle, LINE_STYLES),
    draggable:
      input.draggable === undefined ? true : checkBoolean(`${label}.draggable`, input.draggable),
    visible: input.visible === undefined ? true : checkBoolean(`${label}.visible`, input.visible),
    buttons: validateButtons(input.buttons, `${label}.buttons`)
  };
}

function configInput(config: AlertConfig): AlertInput {
  return {
    id: config.id,
    source: config.source,
    trigger: config.trigger,
    value: config.value,
    frequency: config.frequency,
    enabled: config.enabled,
    lineStyle: config.lineStyle,
    draggable: config.draggable,
    visible: config.visible,
    buttons: config.buttons.map((button) => ({ ...button })),
    ...(config.label !== null ? { label: config.label } : {}),
    ...(config.color !== null ? { color: config.color } : {})
  };
}

function sameCondition(left: AlertConfig, right: AlertConfig): boolean {
  const condition = (config: AlertConfig) =>
    JSON.stringify([config.source, config.trigger, config.value, config.frequency, config.enabled]);
  return condition(left) === condition(right);
}

/** Whether the alert still evaluates; firing a `once` alert ends its evaluation. */
function isActive(state: AlertState): boolean {
  return state.status === 'active';
}

function meets(
  trigger: AlertTrigger,
  last: number,
  lastThreshold: number,
  value: number,
  threshold: number
): boolean {
  switch (trigger) {
    case 'above':
      return value > threshold;
    case 'below':
      return value < threshold;
    case 'cross-up':
      return last <= lastThreshold && value > threshold;
    case 'cross-down':
      return last >= lastThreshold && value < threshold;
    case 'cross':
      return (
        (last <= lastThreshold && value > threshold) || (last >= lastThreshold && value < threshold)
      );
  }
}

/** Price alerts: evaluated on every data change, drawn as lines when they watch a fixed level. */
export class AlertsDomain implements ObjectDomain {
  readonly kind = 'alert';
  private states = new Map<string, AlertState>();
  private readonly icons = new IconCache();

  constructor(
    private readonly bars: BarStore,
    private readonly host: AlertsHost
  ) {}

  has(id: string): boolean {
    return this.states.has(id);
  }

  list(): Alert[] {
    return [...this.states.values()].map((state) => this.info(state));
  }

  get(id: string): Alert | null {
    const state = this.states.get(id);
    return state ? this.info(state) : null;
  }

  /** Output keys of an indicator that alerts read, with the ids of those alerts. */
  indicatorKeys(indicatorId: string): Array<{ alert: string; key: string }> {
    const uses: Array<{ alert: string; key: string }> = [];

    for (const { config } of this.states.values()) {
      for (const source of [config.source, config.value]) {
        if (
          typeof source !== 'number' &&
          source.kind === 'indicator' &&
          source.id === indicatorId
        ) {
          uses.push({ alert: config.id, key: source.key });
        }
      }
    }

    return uses;
  }

  /** Takes the current values as the reference of every alert, e.g. after an input was redefined. */
  rebaseline(): void {
    this.states.forEach((state) => {
      this.baseline(state);
    });
  }

  /** Ids of the alerts that read the indicator or series with this id. */
  references(id: string): string[] {
    const uses = (source: ValueSource) => source.kind !== 'price' && source.id === id;
    return [...this.states.values()]
      .filter(
        ({ config }) =>
          uses(config.source) || (typeof config.value !== 'number' && uses(config.value))
      )
      .map(({ config }) => config.id);
  }

  set(inputs: readonly AlertInput[]): void {
    const next = new Map<string, AlertState>();

    inputs.forEach((input, index) => {
      const config = parseAlert(input, this.host.reader, `alerts[${index}]`);

      if (next.has(config.id)) {
        fail(`alerts contains the id "${config.id}" twice.`);
      }

      // An alert whose condition is unchanged keeps its status, e.g. when an app re-sends its list.
      const current = this.states.get(config.id);

      if (current && sameCondition(current.config, config)) {
        current.config = config;
        next.set(config.id, current);
      } else {
        next.set(config.id, this.createState(config));
      }
    });

    this.states = next;
  }

  add(input: AlertInput): void {
    const config = parseAlert(input, this.host.reader);

    if (this.states.has(config.id)) {
      fail(`An alert with id "${config.id}" already exists.`);
    }

    this.states.set(config.id, this.createState(config));
  }

  update(id: string, patch: Partial<Omit<AlertInput, 'id'>>): void {
    const state = this.require(id);
    const config = parseAlert({ ...configInput(state.config), ...patch, id }, this.host.reader);
    const rearm =
      patch.trigger !== undefined || patch.value !== undefined || patch.source !== undefined;
    state.config = config;

    if (!config.enabled) {
      state.status = 'disabled';
    } else if (rearm || state.status === 'disabled') {
      state.status = 'active';
    }

    this.baseline(state);
  }

  remove(id: string): void {
    this.require(id);
    this.states.delete(id);
  }

  /** Arms a triggered alert again. */
  rearm(id: string): void {
    const state = this.require(id);

    if (state.config.enabled) {
      state.status = 'active';
      state.triggeredAt = null;
      this.baseline(state);
    }
  }

  private require(id: string): AlertState {
    return this.states.get(id) ?? fail(`Unknown alert "${id}".`);
  }

  private info(state: AlertState): Alert {
    return { ...state.config, status: state.status, triggeredAt: state.triggeredAt };
  }

  private createState(config: AlertConfig): AlertState {
    const state: AlertState = {
      config,
      status: config.enabled ? 'active' : 'disabled',
      triggeredAt: null,
      last: Number.NaN,
      lastThreshold: Number.NaN,
      closedIndex: -1
    };
    this.baseline(state);
    return state;
  }

  private threshold(config: AlertConfig, index: number): number {
    return typeof config.value === 'number'
      ? config.value
      : this.host.reader.read(config.value, index);
  }

  /** Takes the current values as the reference for the next evaluation, without firing. */
  private baseline(state: AlertState): void {
    const { config } = state;
    const last = this.bars.length - 1;
    const index = config.frequency === 'once-per-bar-close' ? last - 1 : last;
    state.closedIndex = last - 1;
    state.last = index >= 0 ? this.host.reader.read(config.source, index) : Number.NaN;
    state.lastThreshold = index >= 0 ? this.threshold(config, index) : Number.NaN;
  }

  // ─── Evaluation ────────────────────────────────────────────────────────────

  /** Evaluates the alerts after the bars changed. History loads only re-baseline. */
  evaluate(change: BarChange): void {
    for (const state of this.states.values()) {
      if (change.kind === 'reset' || state.status !== 'active') {
        this.baseline(state);
        continue;
      }

      const last = this.bars.length - 1;

      if (state.config.frequency === 'once-per-bar-close') {
        for (let index = state.closedIndex + 1; index < last && isActive(state); index += 1) {
          this.step(state, index);
          state.closedIndex = index;
        }
      } else {
        for (let index = change.from; index <= last && isActive(state); index += 1) {
          this.step(state, index);
        }
      }
    }
  }

  private step(state: AlertState, index: number): void {
    const { config } = state;
    const value = this.host.reader.read(config.source, index);
    const threshold = this.threshold(config, index);
    const time = this.bars.time(index);
    const comparable = [value, threshold, state.last, state.lastThreshold].every(Number.isFinite);
    const crossing = config.trigger !== 'above' && config.trigger !== 'below';
    const fire =
      (comparable || (!crossing && Number.isFinite(value) && Number.isFinite(threshold))) &&
      meets(config.trigger, state.last, state.lastThreshold, value, threshold) &&
      !(config.frequency === 'once-per-bar' && state.triggeredAt === time);

    state.last = value;
    state.lastThreshold = threshold;

    if (!fire) {
      return;
    }

    state.triggeredAt = time;

    if (config.frequency === 'once') {
      state.status = 'triggered';
    }

    this.host.triggered({ id: config.id, time, value, threshold, trigger: config.trigger });
  }

  // ─── Lines ─────────────────────────────────────────────────────────────────

  private layouts(context: ObjectContext): Array<{ pane: PaneFrame; layouts: PriceLineLayout[] }> {
    const byPane = new Map<string, PriceLineView[]>();
    const { theme } = context.options;

    for (const { config, status } of this.states.values()) {
      if (typeof config.value !== 'number' || !config.visible) {
        continue;
      }

      const paneId = this.host.reader.paneOf(config.source);
      const pane = paneOf(context.frame, paneId);

      if (!pane) {
        continue;
      }

      const color = config.color ?? theme.alert;
      const views = byPane.get(paneId) ?? [];
      views.push({
        id: config.id,
        y: pane.scale.valueToY(config.value),
        color: status === 'active' ? color : withAlpha(color, 0.45),
        text: config.label ?? '',
        axisText: this.host.formatValue(pane, config.value),
        buttons: config.buttons,
        lineStyle: config.lineStyle,
        emphasized:
          (context.selection?.kind === 'alert' && context.selection.id === config.id) ||
          (context.hovered?.kind === 'alert' && context.hovered.id === config.id)
      });
      byPane.set(paneId, views);
    }

    return [...byPane.entries()].flatMap(([paneId, views]) => {
      const pane = paneOf(context.frame, paneId);
      return pane
        ? [
            {
              pane,
              layouts: layoutPriceLines(
                views,
                pane.plot.width,
                context.options.font.size,
                context.measureText
              )
            }
          ]
        : [];
    });
  }

  hitTest(context: ObjectContext, point: Point): ObjectHit | null {
    for (const { pane, layouts } of this.layouts(context)) {
      if (point.y < pane.plot.y || point.y >= pane.plot.y + pane.plot.height) {
        continue;
      }

      const hit = hitPriceLines(
        layouts,
        { x: point.x, y: point.y - pane.plot.y },
        context.options.drawings.hitTolerance
      );
      const state = hit ? this.states.get(hit.id) : undefined;

      if (hit && state) {
        const draggable = state.config.draggable && !hit.part.startsWith('button:');
        return {
          target: {
            kind: 'alert',
            id: hit.id,
            part: hit.part,
            cursor: draggable ? 'ns-resize' : 'pointer',
            draggable
          },
          priority: hit.priority,
          distance: hit.distance
        };
      }
    }

    return null;
  }

  beginDrag(context: ObjectContext, target: HitTarget): DragSession | null {
    const state = this.states.get(target.id);

    if (!state || typeof state.config.value !== 'number' || !state.config.draggable) {
      return null;
    }

    const paneId = this.host.reader.paneOf(state.config.source);

    if (!paneOf(context.frame, paneId)) {
      return null;
    }

    const initialPrice = state.config.value;
    let price = initialPrice;
    const emit = (phase: PriceDragEvent['phase'], value: number) => {
      this.host.dragged({ id: state.config.id, phase, price: value, initialPrice });
    };
    const setValue = (value: number) => {
      state.config = { ...state.config, value };
      // Moving the level is not a crossing: evaluate the next tick against the new level.
      this.baseline(state);
      this.host.repaint();
    };
    emit('start', price);

    return {
      move: (point) => {
        const pane = paneOf(this.host.context().frame, paneId);

        if (!pane || !this.states.has(state.config.id)) {
          return;
        }

        const factor = 10 ** this.host.precision(pane);
        const next = Math.round(pane.scale.yToValue(point.y - pane.plot.y) * factor) / factor;

        if (Number.isFinite(next) && next !== price) {
          price = next;
          setValue(price);
          emit('move', price);
        }
      },
      end: () => {
        this.baseline(state);
        emit('end', price);
      },
      cancel: () => {
        setValue(initialPrice);
        emit('cancel', initialPrice);
      }
    };
  }

  paint(context: ObjectPaintContext): void {
    const { ctx } = context;

    for (const { pane, layouts } of this.layouts(context)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, pane.plot.y, context.frame.layout.width, pane.plot.height);
      ctx.clip();
      paintPriceLines(
        ctx,
        layouts,
        pane.plot,
        pane.axis,
        {
          fontSize: context.options.font.size,
          fontFamily: context.options.font.family,
          pixelRatio: context.pixelRatio,
          textColor: '#ffffff',
          showAxis: context.options.priceScale.visible
        },
        this.icons
      );
      ctx.restore();
    }
  }
}
