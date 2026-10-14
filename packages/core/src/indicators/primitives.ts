/**
 * Incremental building blocks for indicator calculators. Each one consumes one value per bar,
 * returns `NaN` while warming up, and can be cloned to checkpoint its state.
 */

/** Fixed-size ring of the latest values. */
export class RingBuffer {
  private readonly values: Float64Array;
  private start = 0;
  private size = 0;

  constructor(readonly capacity: number) {
    this.values = new Float64Array(Math.max(1, capacity));
  }

  get length(): number {
    return this.size;
  }

  get full(): boolean {
    return this.size === this.capacity;
  }

  /** Appends a value and returns the one it evicted, or `NaN`. */
  push(value: number): number {
    if (this.size < this.capacity) {
      this.values[(this.start + this.size) % this.capacity] = value;
      this.size += 1;
      return Number.NaN;
    }

    const evicted = this.values[this.start] ?? Number.NaN;
    this.values[this.start] = value;
    this.start = (this.start + 1) % this.capacity;
    return evicted;
  }

  /** Value `index` places from the oldest (0 = oldest). */
  at(index: number): number {
    return this.values[(this.start + index) % this.capacity] ?? Number.NaN;
  }

  /** Value `back` places from the newest (0 = newest). */
  fromEnd(back: number): number {
    return back < this.size ? this.at(this.size - 1 - back) : Number.NaN;
  }

  max(): number {
    let result = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < this.size; index += 1) {
      result = Math.max(result, this.at(index));
    }

    return result;
  }

  min(): number {
    let result = Number.POSITIVE_INFINITY;

    for (let index = 0; index < this.size; index += 1) {
      result = Math.min(result, this.at(index));
    }

    return result;
  }

  sum(): number {
    let result = 0;

    for (let index = 0; index < this.size; index += 1) {
      result += this.at(index);
    }

    return result;
  }

  clone(): RingBuffer {
    const copy = new RingBuffer(this.capacity);
    copy.values.set(this.values);
    copy.start = this.start;
    copy.size = this.size;
    return copy;
  }
}

/** Simple moving average over `period` values. */
export class MovingAverage {
  private readonly sum: MovingSum;

  constructor(
    private readonly period: number,
    sum = new MovingSum(period)
  ) {
    this.sum = sum;
  }

  next(value: number): number {
    return this.sum.next(value) / this.period;
  }

  clone(): MovingAverage {
    return new MovingAverage(this.period, this.sum.clone());
  }
}

/** Population standard deviation over `period` values. */
export class StandardDeviation {
  constructor(
    private readonly period: number,
    private readonly window = new RingBuffer(period)
  ) {}

  next(value: number): number {
    this.window.push(value);

    if (!this.window.full) {
      return Number.NaN;
    }

    const mean = this.window.sum() / this.period;
    let variance = 0;

    for (let index = 0; index < this.period; index += 1) {
      variance += (this.window.at(index) - mean) ** 2;
    }

    return Math.sqrt(variance / this.period);
  }

  clone(): StandardDeviation {
    return new StandardDeviation(this.period, this.window.clone());
  }
}

/**
 * Exponentially weighted average `y = (weight * x + (period - weight) * y') / period`, seeded with
 * the first value unless an initial `y'` is given. `weight = 2` with `period = n + 1` is the classic
 * EMA; `weight = 1` is the SMA(N, 1) used by RSI and KDJ in Chinese charting software (Wilder
 * smoothing). `NaN` inputs are skipped.
 */
export class WeightedAverage {
  constructor(
    private readonly period: number,
    private readonly weight: number,
    private value = Number.NaN
  ) {}

  next(input: number): number {
    if (Number.isNaN(input)) {
      return this.value;
    }

    this.value = Number.isNaN(this.value)
      ? input
      : (this.weight * input + (this.period - this.weight) * this.value) / this.period;
    return this.value;
  }

  clone(): WeightedAverage {
    return new WeightedAverage(this.period, this.weight, this.value);
  }
}

/** Classic EMA with `alpha = 2 / (period + 1)`, seeded with the first value. */
export function ema(period: number): WeightedAverage {
  return new WeightedAverage(period + 1, 2);
}

/** Running sum over `period` values; `NaN` while the window holds a `NaN`. */
export class MovingSum {
  constructor(
    period: number,
    private readonly window = new RingBuffer(period),
    private sum = 0
  ) {}

  next(value: number): number {
    const evicted = this.window.push(value);
    // A NaN poisons the running total, so it is summed afresh until the NaN has left the window.
    this.sum = Number.isNaN(this.sum)
      ? this.window.sum()
      : this.sum + (value - (Number.isNaN(evicted) ? 0 : evicted));
    return this.window.full ? this.sum : Number.NaN;
  }

  clone(): MovingSum {
    return new MovingSum(this.window.capacity, this.window.clone(), this.sum);
  }
}

/** Highest high and lowest low of the latest `period` bars; `NaN` until `period` bars were added. */
export class RollingExtremes {
  constructor(
    period: number,
    private readonly highs = new RingBuffer(period),
    private readonly lows = new RingBuffer(period)
  ) {}

  push(high: number, low: number): void {
    this.highs.push(high);
    this.lows.push(low);
  }

  highest(): number {
    return this.highs.full ? this.highs.max() : Number.NaN;
  }

  lowest(): number {
    return this.lows.full ? this.lows.min() : Number.NaN;
  }

  clone(): RollingExtremes {
    return new RollingExtremes(this.highs.capacity, this.highs.clone(), this.lows.clone());
  }
}

/** Remembers the previous value of a series. */
export class Previous {
  private last = Number.NaN;

  /** Returns the value from the previous call, then stores `value`. */
  next(value: number): number {
    const previous = this.last;
    this.last = value;
    return previous;
  }

  clone(): Previous {
    const copy = new Previous();
    copy.last = this.last;
    return copy;
  }
}
