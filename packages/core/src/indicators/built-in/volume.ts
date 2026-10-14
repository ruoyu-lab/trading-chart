import type { Bar } from '../../data/types';
import { MovingAverage, MovingSum, Previous } from '../primitives';
import type { IndicatorDefinition, IndicatorOutput, IndicatorStream } from '../types';
import { IDENTITY, lineOutput, ParallelStream, periodParam, ratio } from './shared';

/** Volume columns colored by the bar direction, with moving averages of the volume. */
export const VOL: IndicatorDefinition<{ periods: readonly number[] }> = {
  name: 'VOL',
  pane: 'new',
  precision: 'volume',
  params: {
    periods: { default: [5, 10], min: 1, max: 2000, integer: true, label: 'MA periods' }
  },
  outputs: ({ periods }) => [
    { key: 'volume', label: 'VOL', plot: { kind: 'histogram', colorBy: 'bar' } },
    ...periods.map((period): IndicatorOutput => ({
      key: `ma${period}`,
      label: `MA${period}`,
      plot: { kind: 'line' }
    }))
  ],
  create: ({ periods }) =>
    new ParallelStream(
      [IDENTITY, ...periods.map((period) => new MovingAverage(period))],
      (bar) => bar.volume
    )
};

/** Running total of the volume, added on up closes and subtracted on down closes. */
class ObvStream implements IndicatorStream {
  private readonly out = new Float64Array(1);

  constructor(
    private readonly closes = new Previous(),
    private total = 0
  ) {}

  next(bar: Bar): ArrayLike<number> {
    const change = bar.close - this.closes.next(bar.close);

    if (Number.isNaN(change)) {
      this.out[0] = Number.NaN;
      return this.out;
    }

    this.total += Math.sign(change) * bar.volume;
    this.out[0] = this.total;
    return this.out;
  }

  clone(): IndicatorStream {
    return new ObvStream(this.closes.clone(), this.total);
  }
}

export const OBV: IndicatorDefinition<Record<string, never>> = {
  name: 'OBV',
  pane: 'new',
  precision: 'volume',
  params: {},
  outputs: () => [lineOutput('OBV')],
  create: () => new ObvStream()
};

/** `(2 * up + flat) / (2 * down + flat) * 100` of the volume on up, down and unchanged closes. */
class VrStream implements IndicatorStream {
  private readonly out = new Float64Array(1);

  constructor(
    private readonly period: number,
    private readonly closes = new Previous(),
    private readonly up = new MovingSum(period),
    private readonly down = new MovingSum(period),
    private readonly flat = new MovingSum(period)
  ) {}

  next(bar: Bar): ArrayLike<number> {
    const change = bar.close - this.closes.next(bar.close);

    if (Number.isNaN(change)) {
      this.out[0] = Number.NaN;
      return this.out;
    }

    const up = this.up.next(change > 0 ? bar.volume : 0);
    const down = this.down.next(change < 0 ? bar.volume : 0);
    const flat = this.flat.next(change === 0 ? bar.volume : 0);
    this.out[0] = ratio(2 * up + flat, 2 * down + flat) * 100;
    return this.out;
  }

  clone(): IndicatorStream {
    return new VrStream(
      this.period,
      this.closes.clone(),
      this.up.clone(),
      this.down.clone(),
      this.flat.clone()
    );
  }
}

export const VR: IndicatorDefinition<{ period: number }> = {
  name: 'VR',
  pane: 'new',
  precision: 2,
  params: { period: periodParam(24) },
  outputs: () => [lineOutput('VR')],
  create: ({ period }) => new VrStream(period)
};

/**
 * Ease of movement as in Chinese charting software, free of price and volume scale:
 * `MID = 100 * Δ(H + L) / (H + L)` weighted by `MA(VOL, N) / VOL` and by `(H - L) / MA(H - L, N)`,
 * averaged over `period` bars into EMV and over `signal` bars into MAEMV. A bar without volume or
 * with `H + L = 0` has no value, so the averages are `NaN` while it is in their window.
 */
class EmvStream implements IndicatorStream {
  private readonly out = new Float64Array(2);

  constructor(
    private readonly period: number,
    private readonly signalPeriod: number,
    private readonly levels = new Previous(),
    private readonly volumes = new MovingAverage(period),
    private readonly ranges = new MovingAverage(period),
    private readonly emv = new MovingAverage(period),
    private readonly signal = new MovingAverage(signalPeriod)
  ) {}

  next(bar: Bar): ArrayLike<number> {
    const level = bar.high + bar.low;
    const range = bar.high - bar.low;
    const mid = ratio(level - this.levels.next(level), level) * 100;
    const volume = ratio(this.volumes.next(bar.volume), bar.volume);
    const emv = this.emv.next(ratio(mid * volume * range, this.ranges.next(range)));
    this.out[0] = emv;
    this.out[1] = this.signal.next(emv);
    return this.out;
  }

  clone(): IndicatorStream {
    return new EmvStream(
      this.period,
      this.signalPeriod,
      this.levels.clone(),
      this.volumes.clone(),
      this.ranges.clone(),
      this.emv.clone(),
      this.signal.clone()
    );
  }
}

export const EMV: IndicatorDefinition<{ period: number; signal: number }> = {
  name: 'EMV',
  pane: 'new',
  precision: 2,
  params: { period: periodParam(14), signal: periodParam(9, 'Signal') },
  outputs: () => [lineOutput('EMV'), lineOutput('MAEMV')],
  create: ({ period, signal }) => new EmvStream(period, signal)
};

/**
 * Money flow index over the typical price `TP = (H + L + C) / 3`: `100 * positive / (positive +
 * negative)` money flow, which equals `100 - 100 / (1 + positive / negative)`.
 */
class MfiStream implements IndicatorStream {
  private readonly out = new Float64Array(1);

  constructor(
    private readonly period: number,
    private readonly typicals = new Previous(),
    private readonly positive = new MovingSum(period),
    private readonly negative = new MovingSum(period)
  ) {}

  next(bar: Bar): ArrayLike<number> {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const change = typical - this.typicals.next(typical);

    if (Number.isNaN(change)) {
      this.out[0] = Number.NaN;
      return this.out;
    }

    const flow = typical * bar.volume;
    const positive = this.positive.next(change > 0 ? flow : 0);
    const negative = this.negative.next(change < 0 ? flow : 0);
    this.out[0] = ratio(positive, positive + negative) * 100;
    return this.out;
  }

  clone(): IndicatorStream {
    return new MfiStream(
      this.period,
      this.typicals.clone(),
      this.positive.clone(),
      this.negative.clone()
    );
  }
}

export const MFI: IndicatorDefinition<{ period: number }> = {
  name: 'MFI',
  pane: 'new',
  precision: 2,
  params: { period: periodParam(14) },
  outputs: () => [lineOutput('MFI')],
  levels: () => [20, 80],
  range: { min: 0, max: 100 },
  create: ({ period }) => new MfiStream(period)
};
