import { ema, MovingAverage, StandardDeviation, WeightedAverage } from '../primitives';
import type { IndicatorDefinition, IndicatorStream } from '../types';
import { lineOutputs, ParallelStream, periodsParam } from './shared';

export const MA: IndicatorDefinition<{ periods: readonly number[] }> = {
  name: 'MA',
  pane: 'main',
  precision: 'price',
  params: { periods: periodsParam([5, 10, 20, 30]) },
  outputs: ({ periods }) => lineOutputs('MA', periods),
  create: ({ periods }) =>
    new ParallelStream(
      periods.map((period) => new MovingAverage(period)),
      (_bar, price) => price
    )
};

export const EMA: IndicatorDefinition<{ periods: readonly number[] }> = {
  name: 'EMA',
  pane: 'main',
  precision: 'price',
  params: { periods: periodsParam([12, 26]) },
  outputs: ({ periods }) => lineOutputs('EMA', periods),
  create: ({ periods }) =>
    new ParallelStream(
      periods.map((period) => ema(period)),
      (_bar, price) => price
    )
};

/** Smoothed (Wilder) moving average, `SMA(X, N, 1)` in Chinese charting software. */
export const SMMA: IndicatorDefinition<{ periods: readonly number[] }> = {
  name: 'SMMA',
  pane: 'main',
  precision: 'price',
  params: { periods: periodsParam([7, 14]) },
  outputs: ({ periods }) => lineOutputs('SMMA', periods),
  create: ({ periods }) =>
    new ParallelStream(
      periods.map((period) => new WeightedAverage(period, 1)),
      (_bar, price) => price
    )
};

class BollingerStream implements IndicatorStream {
  private readonly out = new Float64Array(3);

  constructor(
    private readonly multiplier: number,
    private readonly mean: MovingAverage,
    private readonly deviation: StandardDeviation
  ) {}

  next(_bar: unknown, price: number): ArrayLike<number> {
    const mid = this.mean.next(price);
    const spread = this.deviation.next(price) * this.multiplier;
    this.out[0] = mid;
    this.out[1] = mid + spread;
    this.out[2] = mid - spread;
    return this.out;
  }

  clone(): IndicatorStream {
    return new BollingerStream(this.multiplier, this.mean.clone(), this.deviation.clone());
  }
}

/** Bollinger Bands with a population standard deviation. */
export const BOLL: IndicatorDefinition<{ period: number; multiplier: number }> = {
  name: 'BOLL',
  pane: 'main',
  precision: 'price',
  params: {
    period: { default: 20, min: 2, max: 2000, integer: true, label: 'Period' },
    multiplier: { default: 2, min: 0.1, max: 10, label: 'StdDev' }
  },
  outputs: () => [
    { key: 'mid', label: 'MID', plot: { kind: 'line' } },
    { key: 'upper', label: 'UPPER', plot: { kind: 'line' } },
    { key: 'lower', label: 'LOWER', plot: { kind: 'line' } }
  ],
  fills: [{ from: 'upper', to: 'lower' }],
  create: ({ period, multiplier }) =>
    new BollingerStream(multiplier, new MovingAverage(period), new StandardDeviation(period))
};
