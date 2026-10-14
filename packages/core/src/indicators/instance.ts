import type { BarStore } from '../data/bar-store';
import type { Bar, PriceSource } from '../data/types';
import { fail } from '../utils/errors';
import { checkNumber } from '../utils/validate';
import type {
  BarWindow,
  IndicatorDefinition,
  IndicatorOutput,
  IndicatorStream,
  ParamValues
} from './types';

interface MutableBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const EMPTY_BAR: Bar = { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 };

/** Wraps a `lookback`/`compute` definition into a stream over a ring of recent bars. */
class WindowStream implements IndicatorStream, BarWindow {
  private start = 0;
  private size = 0;
  private readonly empty: Float64Array;

  constructor(
    private readonly capacity: number,
    outputCount: number,
    private readonly compute: (window: BarWindow) => ArrayLike<number>,
    /** time, open, high, low, close, volume and price columns. */
    private readonly columns: Float64Array[] = Array.from(
      { length: 7 },
      () => new Float64Array(capacity)
    )
  ) {
    this.empty = new Float64Array(outputCount).fill(Number.NaN);
  }

  get length(): number {
    return this.size;
  }

  bar(index: number): Bar {
    const slot = (this.start + index) % this.capacity;
    const read = (column: number) => this.columns[column]?.[slot] ?? Number.NaN;
    return {
      time: read(0),
      open: read(1),
      high: read(2),
      low: read(3),
      close: read(4),
      volume: read(5)
    };
  }

  price(index: number): number {
    return this.columns[6]?.[(this.start + index) % this.capacity] ?? Number.NaN;
  }

  next(bar: Bar, price: number): ArrayLike<number> {
    const slot = this.size < this.capacity ? (this.start + this.size) % this.capacity : this.start;
    const values = [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume, price];
    this.columns.forEach((column, index) => {
      column[slot] = values[index] ?? Number.NaN;
    });

    if (this.size < this.capacity) {
      this.size += 1;
    } else {
      this.start = (this.start + 1) % this.capacity;
    }

    return this.size === this.capacity ? this.compute(this) : this.empty;
  }

  clone(): IndicatorStream {
    const copy = new WindowStream(
      this.capacity,
      this.empty.length,
      this.compute,
      this.columns.map((column) => column.slice())
    );
    copy.start = this.start;
    copy.size = this.size;
    return copy;
  }
}

function createStream(
  definition: IndicatorDefinition,
  params: ParamValues,
  outputCount: number
): IndicatorStream {
  if ('create' in definition) {
    return definition.create(params);
  }

  const lookback = definition.lookback(params);
  checkNumber('lookback', lookback, { min: 1, integer: true });
  return new WindowStream(lookback, outputCount, (window) => definition.compute(window, params));
}

/** Merges parameter overrides into the definition defaults and validates them. */
export function resolveParams(
  definition: IndicatorDefinition,
  overrides: ParamValues | undefined,
  type: string
): ParamValues {
  const params: Record<string, number | readonly number[]> = {};

  for (const key of Object.keys(overrides ?? {})) {
    if (!(key in definition.params)) {
      fail(`Indicator "${type}" has no parameter "${key}".`);
    }
  }

  for (const [key, spec] of Object.entries(definition.params)) {
    const value = overrides?.[key] ?? spec.default;
    const rule = {
      ...(spec.min !== undefined ? { min: spec.min } : {}),
      ...(spec.max !== undefined ? { max: spec.max } : {}),
      ...(spec.integer ? { integer: true } : {})
    };

    if (Array.isArray(spec.default)) {
      if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
        fail(`Parameter "${key}" of indicator "${type}" must be a list of 1 to 8 numbers.`);
      }

      (value as readonly number[]).forEach((item, index) => {
        checkNumber(`params.${key}[${index}]`, item, rule);
      });
      params[key] = [...(value as readonly number[])];
    } else {
      params[key] = checkNumber(`params.${key}`, value, rule);
    }
  }

  return params;
}

/**
 * Values of one indicator over the main bars. Recomputes from scratch when the bars are reset and
 * otherwise resumes from a checkpoint taken before the last bar, so a tick costs one step.
 */
export class IndicatorSeries {
  private columns: Float64Array[];
  private stream: IndicatorStream | null = null;
  private checkpoint: IndicatorStream | null = null;
  private computedCount = 0;
  private revision = -1;
  private readonly scratch: MutableBar = { ...EMPTY_BAR };

  constructor(
    private readonly store: BarStore,
    private readonly definition: IndicatorDefinition,
    private readonly params: ParamValues,
    readonly outputs: readonly IndicatorOutput[],
    private readonly source: PriceSource
  ) {
    this.columns = outputs.map(() => new Float64Array(0));
  }

  /** Brings the values up to date with the bars. */
  sync(): void {
    const change = this.store.changesSince(this.revision);

    if (!change) {
      return;
    }

    const count = this.store.length;
    this.ensureCapacity(count);

    if (change.kind === 'reset' || !this.checkpoint || this.computedCount === 0) {
      this.stream = createStream(this.definition, this.params, this.outputs.length);
      this.run(0, count);
    } else {
      this.stream = this.checkpoint.clone();
      this.run(this.computedCount - 1, count);
    }

    this.computedCount = count;
    this.revision = this.store.revision;
  }

  /** Value of output `column` at bar `index`; `NaN` when absent. */
  value(column: number, index: number): number {
    return this.columns[column]?.[index] ?? Number.NaN;
  }

  private run(from: number, to: number): void {
    const stream = this.stream;

    if (!stream) {
      return;
    }

    for (let index = from; index < to; index += 1) {
      if (index === to - 1) {
        this.checkpoint = stream.clone();
      }

      const bar = this.readBar(index);
      const values = stream.next(bar, this.store.price(index, this.source));

      for (let column = 0; column < this.columns.length; column += 1) {
        const target = this.columns[column];

        if (target) {
          target[index] = values[column] ?? Number.NaN;
        }
      }
    }

    if (from >= to) {
      this.checkpoint = null;
    }
  }

  private readBar(index: number): Bar {
    const bar = this.scratch;
    bar.time = this.store.time(index);
    bar.open = this.store.open(index);
    bar.high = this.store.high(index);
    bar.low = this.store.low(index);
    bar.close = this.store.close(index);
    bar.volume = this.store.volume(index);
    return bar;
  }

  private ensureCapacity(count: number): void {
    const current = this.columns[0]?.length ?? 0;

    if (current >= count) {
      return;
    }

    const capacity = Math.max(64, count, current * 2);
    this.columns = this.columns.map((column) => {
      const next = new Float64Array(capacity).fill(Number.NaN);
      next.set(column.subarray(0, Math.min(column.length, count)));
      return next;
    });
  }
}
