import type { Bar } from '../../data/types';
import { Previous, RingBuffer, StandardDeviation, WeightedAverage } from '../primitives';
import type { IndicatorDefinition, IndicatorStream } from '../types';
import { lineOutput, ParallelStream, periodParam, ratio } from './shared';

/** `MAX(H - L, |H - C'|, |L - C'|)`; `NaN` without a previous close `C'`. */
function trueRange(bar: Bar, previousClose: number): number {
  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - previousClose),
    Math.abs(bar.low - previousClose)
  );
}

class AtrStream implements IndicatorStream {
  private readonly out = new Float64Array(1);

  constructor(
    private readonly period: number,
    private readonly closes = new Previous(),
    private readonly average = new WeightedAverage(period, 1)
  ) {}

  next(bar: Bar): ArrayLike<number> {
    this.out[0] = this.average.next(trueRange(bar, this.closes.next(bar.close)));
    return this.out;
  }

  clone(): IndicatorStream {
    return new AtrStream(this.period, this.closes.clone(), this.average.clone());
  }
}

/** Average true range with Wilder smoothing, `SMA(TR, N, 1)`. */
export const ATR: IndicatorDefinition<{ period: number }> = {
  name: 'ATR',
  pane: 'new',
  precision: 'price',
  params: { period: periodParam(14) },
  outputs: () => [lineOutput('ATR')],
  create: ({ period }) => new AtrStream(period)
};

/** Population standard deviation of the source price. */
export const STD: IndicatorDefinition<{ period: number }> = {
  name: 'STD',
  pane: 'new',
  precision: 'price',
  params: { period: { ...periodParam(20), min: 2 } },
  outputs: () => [lineOutput('STD')],
  create: ({ period }) =>
    new ParallelStream([new StandardDeviation(period)], (_bar, price) => price)
};

/**
 * Wilder's directional movement: PDI and MDI are the smoothed +DM and -DM over the smoothed true
 * range, ADX is the smoothed `|PDI - MDI| / (PDI + MDI)`, and ADXR averages ADX with its value
 * `period` bars back. Every smoothing is `SMA(X, period, 1)`.
 */
class DmiStream implements IndicatorStream {
  private readonly out = new Float64Array(4);

  constructor(
    private readonly period: number,
    private readonly highs = new Previous(),
    private readonly lows = new Previous(),
    private readonly closes = new Previous(),
    private readonly range = new WeightedAverage(period, 1),
    private readonly plus = new WeightedAverage(period, 1),
    private readonly minus = new WeightedAverage(period, 1),
    private readonly adx = new WeightedAverage(period, 1),
    private readonly adxHistory = new RingBuffer(period)
  ) {}

  next(bar: Bar): ArrayLike<number> {
    const up = bar.high - this.highs.next(bar.high);
    const down = this.lows.next(bar.low) - bar.low;
    const previousClose = this.closes.next(bar.close);

    if (Number.isNaN(previousClose)) {
      this.out.fill(Number.NaN);
      return this.out;
    }

    const range = this.range.next(trueRange(bar, previousClose));
    const pdi = ratio(this.plus.next(up > down && up > 0 ? up : 0), range) * 100;
    const mdi = ratio(this.minus.next(down > up && down > 0 ? down : 0), range) * 100;
    const adx = this.adx.next(ratio(Math.abs(pdi - mdi), pdi + mdi) * 100);
    this.out[0] = pdi;
    this.out[1] = mdi;
    this.out[2] = adx;
    this.out[3] = (adx + this.adxHistory.push(adx)) / 2;
    return this.out;
  }

  clone(): IndicatorStream {
    return new DmiStream(
      this.period,
      this.highs.clone(),
      this.lows.clone(),
      this.closes.clone(),
      this.range.clone(),
      this.plus.clone(),
      this.minus.clone(),
      this.adx.clone(),
      this.adxHistory.clone()
    );
  }
}

export const DMI: IndicatorDefinition<{ period: number }> = {
  name: 'DMI',
  pane: 'new',
  precision: 2,
  params: { period: periodParam(14) },
  outputs: () => ['PDI', 'MDI', 'ADX', 'ADXR'].map(lineOutput),
  create: ({ period }) => new DmiStream(period)
};
