import { fail } from '../utils/errors';
import { checkObject } from '../utils/validate';
import { toTime } from './time';
import type { Bar, BarChange, BarInput, PriceSource } from './types';

const MAX_CHANGE_LOG = 256;
const INTERVAL_SAMPLE = 64;

interface ChangeEntry {
  revision: number;
  from: number;
}

function validateBar(input: BarInput, label: string): Bar {
  checkObject(label, input);

  const time = toTime(input.time, `${label}.time`);
  const { open, high, low, close } = input;
  const volume = input.volume ?? 0;

  for (const [field, value] of [
    ['open', open],
    ['high', high],
    ['low', low],
    ['close', close],
    ['volume', volume]
  ] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(`${label}.${field} must be a finite number, received ${String(value)}.`);
    }
  }

  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    fail(
      `${label} is inconsistent: high (${high}) and low (${low}) must enclose open (${open}) and close (${close}).`
    );
  }

  if (volume < 0) {
    fail(`${label}.volume must not be negative, received ${volume}.`);
  }

  return { time, open, high, low, close, volume };
}

function validateAscending(bars: readonly Bar[], label: string): void {
  for (let index = 1; index < bars.length; index += 1) {
    const previous = bars[index - 1];
    const current = bars[index];

    if (previous && current && current.time <= previous.time) {
      fail(
        `${label} must be sorted by strictly ascending time: bar ${index} (${current.time}) is not after bar ${index - 1} (${previous.time}).`
      );
    }
  }
}

/**
 * Columnar storage for the main OHLCV series. Bars are kept in typed arrays sorted by time.
 * Every mutation bumps {@link revision}; consumers ask {@link changesSince} to update their own
 * derived data incrementally.
 */
export class BarStore {
  private times = new Float64Array(0);
  private opens = new Float64Array(0);
  private highs = new Float64Array(0);
  private lows = new Float64Array(0);
  private closes = new Float64Array(0);
  private volumes = new Float64Array(0);
  private count = 0;
  private currentRevision = 0;
  private resetRevision = 0;
  private changeLog: ChangeEntry[] = [];
  private cachedInterval: number | null = null;

  get length(): number {
    return this.count;
  }

  get revision(): number {
    return this.currentRevision;
  }

  /** Unchecked accessors for hot paths. Callers guarantee `0 <= index < length`. */
  time(index: number): number {
    return this.times[index] ?? Number.NaN;
  }

  open(index: number): number {
    return this.opens[index] ?? Number.NaN;
  }

  high(index: number): number {
    return this.highs[index] ?? Number.NaN;
  }

  low(index: number): number {
    return this.lows[index] ?? Number.NaN;
  }

  close(index: number): number {
    return this.closes[index] ?? Number.NaN;
  }

  volume(index: number): number {
    return this.volumes[index] ?? Number.NaN;
  }

  price(index: number, source: PriceSource): number {
    switch (source) {
      case 'open':
        return this.open(index);
      case 'high':
        return this.high(index);
      case 'low':
        return this.low(index);
      case 'close':
        return this.close(index);
      case 'hl2':
        return (this.high(index) + this.low(index)) / 2;
      case 'hlc3':
        return (this.high(index) + this.low(index) + this.close(index)) / 3;
      case 'ohlc4':
        return (this.open(index) + this.high(index) + this.low(index) + this.close(index)) / 4;
    }
  }

  bar(index: number): Bar | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      return null;
    }

    return {
      time: this.time(index),
      open: this.open(index),
      high: this.high(index),
      low: this.low(index),
      close: this.close(index),
      volume: this.volume(index)
    };
  }

  toArray(): Bar[] {
    const bars: Bar[] = [];

    for (let index = 0; index < this.count; index += 1) {
      const bar = this.bar(index);

      if (bar) {
        bars.push(bar);
      }
    }

    return bars;
  }

  /** First index whose time is `>= time`, or `length` when every bar is earlier. */
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

  /** Index of the bar with exactly this time, or `-1`. */
  indexOf(time: number): number {
    const index = this.lowerBound(time);
    return index < this.count && this.time(index) === time ? index : -1;
  }

  /** Index of the bar whose period contains `time` (the last bar starting at or before it), or `-1`. */
  indexAt(time: number): number {
    const index = this.lowerBound(time);

    if (index < this.count && this.time(index) === time) {
      return index;
    }

    return index - 1;
  }

  /**
   * Continuous logical index of `time`: interpolated between the bars around it and extrapolated
   * with the typical interval outside the data. `NaN` when the position cannot be known (no bars,
   * or a single bar and a different time).
   */
  logicalIndexOf(time: number): number {
    const interval = this.interval();

    if (interval === null) {
      return this.count === 1 && time === this.time(0) ? 0 : Number.NaN;
    }

    if (time <= this.time(0)) {
      return (time - this.time(0)) / interval;
    }

    const index = this.indexAt(time);
    const last = this.count - 1;

    if (index >= last) {
      return last + (time - this.time(last)) / interval;
    }

    const start = this.time(index);
    return index + (time - start) / (this.time(index + 1) - start);
  }

  /** Time at a continuous logical index, the inverse of {@link logicalIndexOf}. */
  timeOfLogicalIndex(logical: number): number {
    const interval = this.interval();

    if (interval === null) {
      return this.count === 1 && logical === 0 ? this.time(0) : Number.NaN;
    }
    const last = this.count - 1;

    if (logical <= 0) {
      return this.time(0) + logical * interval;
    }

    if (logical >= last) {
      return this.time(last) + (logical - last) * interval;
    }

    const index = Math.floor(logical);
    const start = this.time(index);
    return start + (logical - index) * (this.time(index + 1) - start);
  }

  /** Typical spacing between consecutive bars in milliseconds, or `null` with fewer than two bars. */
  interval(): number | null {
    if (this.cachedInterval !== null || this.count < 2) {
      return this.cachedInterval;
    }

    const start = Math.max(1, this.count - INTERVAL_SAMPLE);
    const deltas: number[] = [];

    for (let index = start; index < this.count; index += 1) {
      deltas.push(this.time(index) - this.time(index - 1));
    }

    deltas.sort((left, right) => left - right);
    this.cachedInterval = deltas[Math.floor(deltas.length / 2)] ?? null;
    return this.cachedInterval;
  }

  /** Describes what changed after `revision`, or `null` when nothing did. */
  changesSince(revision: number): BarChange | null {
    if (revision === this.currentRevision) {
      return null;
    }

    if (revision < this.resetRevision || revision > this.currentRevision) {
      return { kind: 'reset' };
    }

    const oldest = this.changeLog[0];

    if (!oldest || oldest.revision > revision + 1) {
      return { kind: 'reset' };
    }

    let from = this.count;

    for (const entry of this.changeLog) {
      if (entry.revision > revision) {
        from = Math.min(from, entry.from);
      }
    }

    return { kind: 'tail', from };
  }

  set(inputs: readonly BarInput[]): void {
    const bars = inputs.map((input, index) => validateBar(input, `bars[${index}]`));
    validateAscending(bars, 'bars');
    this.allocate(bars.length);
    bars.forEach((bar, index) => {
      this.write(index, bar);
    });
    this.count = bars.length;
    this.markReset();
  }

  clear(): void {
    this.count = 0;
    this.markReset();
  }

  /** Replaces the last bar when the time matches, appends newer bars, rejects older ones. */
  update(inputs: readonly BarInput[]): void {
    if (!inputs.length) {
      return;
    }

    const bars = inputs.map((input, index) => validateBar(input, `bars[${index}]`));
    const initialLastTime = this.count ? this.time(this.count - 1) : Number.NEGATIVE_INFINITY;
    let lastTime = initialLastTime;

    bars.forEach((bar, index) => {
      if (bar.time < lastTime) {
        fail(
          `bars[${index}] (time ${bar.time}) is older than the last bar (time ${lastTime}). update() only replaces the last bar or appends newer ones; use set() or prepend() to change history.`
        );
      }

      lastTime = bar.time;
    });

    let from = this.count;
    lastTime = initialLastTime;

    for (const bar of bars) {
      if (this.count > 0 && bar.time === lastTime) {
        this.write(this.count - 1, bar);
        from = Math.min(from, this.count - 1);
      } else {
        this.ensureCapacity(this.count + 1);
        this.write(this.count, bar);
        from = Math.min(from, this.count);
        this.count += 1;
        this.cachedInterval = null;
      }

      lastTime = bar.time;
    }

    this.markTail(from);
  }

  /**
   * Inserts older bars before the first bar. Bars at or after the current first bar are ignored,
   * so overlapping history pages merge without duplicates. Returns the number of inserted bars.
   */
  prepend(inputs: readonly BarInput[]): number {
    const bars = inputs.map((input, index) => validateBar(input, `bars[${index}]`));
    validateAscending(bars, 'bars');
    const firstTime = this.count ? this.time(0) : Number.POSITIVE_INFINITY;
    const older = bars.filter((bar) => bar.time < firstTime);

    if (!older.length) {
      return 0;
    }

    const previousCount = this.count;
    const nextCount = previousCount + older.length;
    const columns = [this.times, this.opens, this.highs, this.lows, this.closes, this.volumes];
    this.allocate(nextCount);
    const nextColumns = [this.times, this.opens, this.highs, this.lows, this.closes, this.volumes];

    nextColumns.forEach((column, columnIndex) => {
      const source = columns[columnIndex];

      if (source) {
        column.set(source.subarray(0, previousCount), older.length);
      }
    });

    older.forEach((bar, index) => {
      this.write(index, bar);
    });
    this.count = nextCount;
    this.markReset();
    return older.length;
  }

  private write(index: number, bar: Bar): void {
    this.times[index] = bar.time;
    this.opens[index] = bar.open;
    this.highs[index] = bar.high;
    this.lows[index] = bar.low;
    this.closes[index] = bar.close;
    this.volumes[index] = bar.volume;
  }

  private allocate(size: number): void {
    const capacity = Math.max(16, size);
    this.times = new Float64Array(capacity);
    this.opens = new Float64Array(capacity);
    this.highs = new Float64Array(capacity);
    this.lows = new Float64Array(capacity);
    this.closes = new Float64Array(capacity);
    this.volumes = new Float64Array(capacity);
  }

  private ensureCapacity(size: number): void {
    if (size <= this.times.length) {
      return;
    }

    const capacity = Math.max(16, this.times.length * 2, size);
    const grow = (source: Float64Array): Float64Array<ArrayBuffer> => {
      const next = new Float64Array(capacity);
      next.set(source.subarray(0, this.count));
      return next;
    };

    this.times = grow(this.times);
    this.opens = grow(this.opens);
    this.highs = grow(this.highs);
    this.lows = grow(this.lows);
    this.closes = grow(this.closes);
    this.volumes = grow(this.volumes);
  }

  private markReset(): void {
    this.currentRevision += 1;
    this.resetRevision = this.currentRevision;
    this.changeLog = [];
    this.cachedInterval = null;
  }

  private markTail(from: number): void {
    this.currentRevision += 1;
    this.changeLog.push({ revision: this.currentRevision, from });

    if (this.changeLog.length > MAX_CHANGE_LOG) {
      this.changeLog.shift();
    }
  }
}
