import type { Bar } from '../../data/types';
import {
  ema,
  MovingAverage,
  Previous,
  RingBuffer,
  RollingExtremes,
  WeightedAverage
} from '../primitives';
import type { IndicatorDefinition, IndicatorStream } from '../types';
import {
  lineOutput,
  lineOutputs,
  ParallelStream,
  periodParam,
  periodsParam,
  ratio,
  type Step
} from './shared';

class MacdStream implements IndicatorStream {
  private readonly out = new Float64Array(3);

  constructor(
    private readonly fast: WeightedAverage,
    private readonly slow: WeightedAverage,
    private readonly signal: WeightedAverage
  ) {}

  next(_bar: unknown, price: number): ArrayLike<number> {
    const dif = this.fast.next(price) - this.slow.next(price);
    const dea = this.signal.next(dif);
    this.out[0] = dif;
    this.out[1] = dea;
    this.out[2] = (dif - dea) * 2;
    return this.out;
  }

  clone(): IndicatorStream {
    return new MacdStream(this.fast.clone(), this.slow.clone(), this.signal.clone());
  }
}

/** MACD with the histogram doubled, as in Chinese charting software. */
export const MACD: IndicatorDefinition<{ fast: number; slow: number; signal: number }> = {
  name: 'MACD',
  pane: 'new',
  precision: 4,
  params: {
    fast: { default: 12, min: 1, max: 500, integer: true, label: 'Fast' },
    slow: { default: 26, min: 1, max: 500, integer: true, label: 'Slow' },
    signal: { default: 9, min: 1, max: 500, integer: true, label: 'Signal' }
  },
  outputs: () => [
    { key: 'dif', label: 'DIF', plot: { kind: 'line' } },
    { key: 'dea', label: 'DEA', plot: { kind: 'line' } },
    { key: 'macd', label: 'MACD', plot: { kind: 'histogram', colorBy: 'sign' } }
  ],
  levels: () => [0],
  create: ({ fast, slow, signal }) => new MacdStream(ema(fast), ema(slow), ema(signal))
};

/** `SMA(MAX(Δ, 0), N, 1) / SMA(|Δ|, N, 1) * 100`, undefined until the price has moved. */
class RsiStep implements Step {
  constructor(
    private readonly period: number,
    private readonly previous = new Previous(),
    private readonly gain = new WeightedAverage(period, 1),
    private readonly move = new WeightedAverage(period, 1)
  ) {}

  next(value: number): number {
    const change = value - this.previous.next(value);
    return ratio(this.gain.next(Math.max(change, 0)), this.move.next(Math.abs(change))) * 100;
  }

  clone(): Step {
    return new RsiStep(this.period, this.previous.clone(), this.gain.clone(), this.move.clone());
  }
}

export const RSI: IndicatorDefinition<{ periods: readonly number[] }> = {
  name: 'RSI',
  pane: 'new',
  precision: 2,
  params: { periods: periodsParam([6, 12, 24]) },
  outputs: ({ periods }) => lineOutputs('RSI', periods),
  levels: () => [20, 80],
  range: { min: 0, max: 100 },
  create: ({ periods }) =>
    new ParallelStream(
      periods.map((period) => new RsiStep(period)),
      (_bar, price) => price
    )
};

/** RSV of the close within the bar range, smoothed into K and D from 50; `J = 3K - 2D`. */
class KdjStream implements IndicatorStream {
  private readonly out = new Float64Array(3);

  constructor(
    private readonly range: RollingExtremes,
    private readonly k: WeightedAverage,
    private readonly d: WeightedAverage
  ) {}

  next(bar: Bar): ArrayLike<number> {
    this.range.push(bar.high, bar.low);
    const lowest = this.range.lowest();
    const spread = this.range.highest() - lowest;

    if (Number.isNaN(spread)) {
      this.out.fill(Number.NaN);
      return this.out;
    }

    // A flat range leaves RSV undefined, so it counts as 50.
    const rsv = spread === 0 ? 50 : ((bar.close - lowest) / spread) * 100;
    const k = this.k.next(rsv);
    const d = this.d.next(k);
    this.out[0] = k;
    this.out[1] = d;
    this.out[2] = 3 * k - 2 * d;
    return this.out;
  }

  clone(): IndicatorStream {
    return new KdjStream(this.range.clone(), this.k.clone(), this.d.clone());
  }
}

export const KDJ: IndicatorDefinition<{ period: number; k: number; d: number }> = {
  name: 'KDJ',
  pane: 'new',
  precision: 2,
  params: { period: periodParam(9), k: periodParam(3, 'K'), d: periodParam(3, 'D') },
  outputs: () => ['K', 'D', 'J'].map(lineOutput),
  levels: () => [20, 80],
  create: ({ period, k, d }) =>
    new KdjStream(
      new RollingExtremes(period),
      new WeightedAverage(k, 1, 50),
      new WeightedAverage(d, 1, 50)
    )
};

class WilliamsStream implements IndicatorStream {
  private readonly out: Float64Array;

  constructor(private readonly ranges: readonly RollingExtremes[]) {
    this.out = new Float64Array(ranges.length);
  }

  next(bar: Bar): ArrayLike<number> {
    this.ranges.forEach((range, index) => {
      range.push(bar.high, bar.low);
      const highest = range.highest();
      const spread = highest - range.lowest();
      // A flat range leaves WR undefined, so it counts as 0.
      this.out[index] = spread === 0 ? 0 : ((highest - bar.close) / spread) * 100;
    });
    return this.out;
  }

  clone(): IndicatorStream {
    return new WilliamsStream(this.ranges.map((range) => range.clone()));
  }
}

/** Williams %R on a positive scale: 0 at the highest high, 100 at the lowest low. */
export const WR: IndicatorDefinition<{ periods: readonly number[] }> = {
  name: 'WR',
  pane: 'new',
  precision: 2,
  params: { periods: periodsParam([14, 28]) },
  outputs: ({ periods }) => lineOutputs('WR', periods),
  levels: () => [20, 80],
  range: { min: 0, max: 100 },
  create: ({ periods }) => new WilliamsStream(periods.map((period) => new RollingExtremes(period)))
};

/** `(TP - MA(TP, N)) / (0.015 * AVEDEV(TP, N))` of the typical price `TP = (H + L + C) / 3`. */
class CciStream implements IndicatorStream {
  private readonly out = new Float64Array(1);

  constructor(private readonly window: RingBuffer) {}

  next(bar: Bar): ArrayLike<number> {
    const typical = (bar.high + bar.low + bar.close) / 3;
    this.window.push(typical);
    this.out[0] = this.window.full ? this.cci(typical) : Number.NaN;
    return this.out;
  }

  clone(): IndicatorStream {
    return new CciStream(this.window.clone());
  }

  /** Sums offsets from `typical`, so a flat window has exactly zero deviation (0 / 0 = `NaN`). */
  private cci(typical: number): number {
    const count = this.window.length;
    let excess = 0;

    for (let index = 0; index < count; index += 1) {
      excess += typical - this.window.at(index);
    }

    excess /= count;
    let deviation = 0;

    for (let index = 0; index < count; index += 1) {
      deviation += Math.abs(typical - this.window.at(index) - excess);
    }

    return ratio(excess, (0.015 * deviation) / count);
  }
}

export const CCI: IndicatorDefinition<{ period: number }> = {
  name: 'CCI',
  pane: 'new',
  precision: 2,
  params: { period: periodParam(14) },
  outputs: () => [lineOutput('CCI')],
  levels: () => [-100, 100],
  create: ({ period }) => new CciStream(new RingBuffer(period))
};

/** Percent change from the value `period` bars back. */
class RocStep implements Step {
  constructor(
    period: number,
    private readonly history = new RingBuffer(period)
  ) {}

  next(value: number): number {
    const base = this.history.push(value);
    return ratio(value - base, base) * 100;
  }

  clone(): Step {
    return new RocStep(this.history.capacity, this.history.clone());
  }
}

export const ROC: IndicatorDefinition<{ period: number }> = {
  name: 'ROC',
  pane: 'new',
  precision: 2,
  params: { period: periodParam(12) },
  outputs: () => [lineOutput('ROC')],
  create: ({ period }) => new ParallelStream([new RocStep(period)], (_bar, price) => price)
};

/** Percent distance from the moving average. */
class BiasStep implements Step {
  constructor(
    private readonly period: number,
    private readonly average = new MovingAverage(period)
  ) {}

  next(value: number): number {
    const average = this.average.next(value);
    return ratio(value - average, average) * 100;
  }

  clone(): Step {
    return new BiasStep(this.period, this.average.clone());
  }
}

export const BIAS: IndicatorDefinition<{ periods: readonly number[] }> = {
  name: 'BIAS',
  pane: 'new',
  precision: 2,
  params: { periods: periodsParam([6, 12, 24]) },
  outputs: ({ periods }) => lineOutputs('BIAS', periods),
  create: ({ periods }) =>
    new ParallelStream(
      periods.map((period) => new BiasStep(period)),
      (_bar, price) => price
    )
};
