import { BarStore } from '../data/bar-store';
import { toTime, type TimeInput } from '../data/time';
import type { BarInput } from '../data/types';
import { describeValue, fail } from '../utils/errors';
import type { Registry } from '../utils/registry';
import { checkBoolean, checkString } from '../utils/validate';
import type { SeriesTypeDefinition } from './types';

export interface ValuePointInput {
  time: TimeInput;
  /** `null` leaves a gap. */
  value: number | null;
}

export type SeriesPointInput = ValuePointInput | BarInput;

export interface SeriesInput {
  /** Generated when omitted. */
  id?: string;
  /** A series type such as `line`, `area`, `columns` or `candles`. */
  type: string;
  /** `main`, `new` (a pane of its own) or the id of an existing pane. Defaults to `main`. */
  pane?: string;
  title?: string;
  visible?: boolean;
  /** Style overrides merged on top of the type's theme-derived defaults. */
  style?: Record<string, unknown>;
  data?: readonly SeriesPointInput[];
}

/** A series as reported by the API (without its data). */
export interface Series {
  readonly id: string;
  readonly type: string;
  readonly pane: string;
  readonly title: string;
  readonly visible: boolean;
  readonly style: Readonly<Record<string, unknown>>;
}

/** Time-sorted values of a value series; `NaN` marks gaps. */
export class ValueStore {
  private times = new Float64Array(0);
  private values = new Float64Array(0);
  private count = 0;

  get length(): number {
    return this.count;
  }

  time(index: number): number {
    return this.times[index] ?? Number.NaN;
  }

  value(index: number): number {
    return this.values[index] ?? Number.NaN;
  }

  lowerBound(time: number): number {
    let low = 0;
    let high = this.count;

    while (low < high) {
      const middle = (low + high) >>> 1;

      if (this.time(middle) < time) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    return low;
  }

  set(points: readonly ValuePointInput[]): void {
    const parsed = parseValuePoints(points);
    this.times = Float64Array.from(parsed, (point) => point.time);
    this.values = Float64Array.from(parsed, (point) => point.value);
    this.count = parsed.length;
  }

  update(points: readonly ValuePointInput[]): void {
    const parsed = parseValuePoints(points);
    let last = this.count ? this.time(this.count - 1) : Number.NEGATIVE_INFINITY;

    parsed.forEach((point, index) => {
      if (point.time < last) {
        fail(
          `points[${index}] is older than the last point; update() only replaces the last point or appends.`
        );
      }

      last = point.time;
    });

    for (const point of parsed) {
      if (this.count > 0 && point.time === this.time(this.count - 1)) {
        this.values[this.count - 1] = point.value;
      } else {
        this.grow(this.count + 1);
        this.times[this.count] = point.time;
        this.values[this.count] = point.value;
        this.count += 1;
      }
    }
  }

  prepend(points: readonly ValuePointInput[]): void {
    const first = this.count ? this.time(0) : Number.POSITIVE_INFINITY;
    const older = parseValuePoints(points).filter((point) => point.time < first);
    const times = new Float64Array(older.length + this.count);
    const values = new Float64Array(older.length + this.count);
    older.forEach((point, index) => {
      times[index] = point.time;
      values[index] = point.value;
    });
    times.set(this.times.subarray(0, this.count), older.length);
    values.set(this.values.subarray(0, this.count), older.length);
    this.times = times;
    this.values = values;
    this.count = times.length;
  }

  private grow(size: number): void {
    if (size <= this.times.length) {
      return;
    }

    const capacity = Math.max(16, size, this.times.length * 2);
    const times = new Float64Array(capacity);
    const values = new Float64Array(capacity);
    times.set(this.times.subarray(0, this.count));
    values.set(this.values.subarray(0, this.count));
    this.times = times;
    this.values = values;
  }
}

function parseValuePoints(
  points: readonly ValuePointInput[]
): Array<{ time: number; value: number }> {
  const parsed = points.map((point, index) => {
    const time = toTime(point.time, `points[${index}].time`);

    if (
      point.value !== null &&
      (typeof point.value !== 'number' || !Number.isFinite(point.value))
    ) {
      fail(
        `points[${index}].value must be a finite number or null, received ${describeValue(point.value)}.`
      );
    }

    return { time, value: point.value ?? Number.NaN };
  });

  parsed.reduce((previous, point, index) => {
    if (point.time <= previous) {
      fail(`points must be sorted by strictly ascending time (points[${index}]).`);
    }

    return point.time;
  }, Number.NEGATIVE_INFINITY);

  return parsed;
}

export interface SeriesEntry {
  readonly id: string;
  readonly type: string;
  readonly definition: SeriesTypeDefinition<object>;
  pane: string;
  title: string;
  visible: boolean;
  style: Record<string, unknown>;
  /** Exactly one of the two stores is used, depending on the definition's input. */
  readonly bars: BarStore | null;
  readonly values: ValueStore | null;
}

/** Additional series drawn next to the main bars, each with its own data. */
export class SeriesStore {
  private readonly entries = new Map<string, SeriesEntry>();
  private nextId = 1;

  constructor(private readonly registry: Registry<SeriesTypeDefinition<object>>) {}

  list(): SeriesEntry[] {
    return [...this.entries.values()];
  }

  get(id: string): SeriesEntry | undefined {
    return this.entries.get(id);
  }

  require(id: string): SeriesEntry {
    return this.entries.get(id) ?? fail(`Unknown series "${id}".`);
  }

  info(entry: SeriesEntry): Series {
    return {
      id: entry.id,
      type: entry.type,
      pane: entry.pane,
      title: entry.title,
      visible: entry.visible,
      style: { ...entry.style }
    };
  }

  add(input: SeriesInput, pane: string): SeriesEntry {
    const id = input.id ?? this.generateId(input.type);
    checkString('series.id', id);
    checkString('series.type', input.type);

    if (this.entries.has(id)) {
      fail(`A series with id "${id}" already exists.`);
    }

    const definition = this.registry.require(input.type);
    const entry: SeriesEntry = {
      id,
      type: input.type,
      definition,
      pane,
      title: input.title ?? id,
      visible: input.visible === undefined ? true : checkBoolean('series.visible', input.visible),
      style: { ...input.style },
      bars: definition.input === 'ohlc' ? new BarStore() : null,
      values: definition.input === 'value' ? new ValueStore() : null
    };

    if (input.data) {
      this.write(entry, 'set', input.data);
    }

    this.entries.set(id, entry);
    return entry;
  }

  update(id: string, patch: Pick<SeriesInput, 'title' | 'visible' | 'style'>): void {
    const entry = this.require(id);
    const title =
      patch.title === undefined ? entry.title : checkString('series.title', patch.title);
    const visible =
      patch.visible === undefined ? entry.visible : checkBoolean('series.visible', patch.visible);
    entry.title = title;
    entry.visible = visible;

    if (patch.style !== undefined) {
      entry.style = { ...entry.style, ...patch.style };
    }
  }

  move(id: string, pane: string): void {
    this.require(id).pane = pane;
  }

  remove(id: string): SeriesEntry {
    const entry = this.require(id);
    this.entries.delete(id);
    return entry;
  }

  write(
    entry: SeriesEntry,
    mode: 'set' | 'update' | 'prepend',
    data: readonly SeriesPointInput[]
  ): void {
    if (entry.bars) {
      const bars = data as readonly BarInput[];

      if (mode === 'set') {
        entry.bars.set(bars);
      } else if (mode === 'update') {
        entry.bars.update(bars);
      } else {
        entry.bars.prepend(bars);
      }
    } else if (entry.values) {
      const values = data.map((point, index) => {
        if (!('value' in point)) {
          fail(
            `Series "${entry.id}" of type "${entry.type}" needs { time, value } points (points[${index}]).`
          );
        }

        return point;
      });

      if (mode === 'set') {
        entry.values.set(values);
      } else if (mode === 'update') {
        entry.values.update(values);
      } else {
        entry.values.prepend(values);
      }
    }
  }

  private generateId(type: string): string {
    let id = `${type}-${this.nextId}`;

    while (this.entries.has(id)) {
      this.nextId += 1;
      id = `${type}-${this.nextId}`;
    }

    this.nextId += 1;
    return id;
  }
}
