import { describe, expect, it } from 'vitest';
import type { BarInput } from '../../src/data/types';
import { createBars } from '../helpers/bars';
import { barsFromCloses, compute, expectClose, incrementalMatchesFull } from './helpers';

const N = Number.NaN;

/** Bars from `[high, low, close, volume]` rows; the open equals the close. */
function barsFrom(rows: readonly (readonly [number, number, number, number?])[]): BarInput[] {
  return rows.map(([high, low, close, volume = 100], index) => ({
    time: Date.UTC(2024, 0, 1) + index * 60_000,
    open: close,
    high,
    low,
    close,
    volume
  }));
}

/** Flat bars: every high, low and close is 10. */
const FLAT = barsFrom([
  [10, 10, 10],
  [10, 10, 10],
  [10, 10, 10]
]);

/** Highs 10, 11, 12, 13 and lows 8, 9, 10, 9. */
const RANGE = barsFrom([
  [10, 8, 9],
  [11, 9, 10],
  [12, 10, 11],
  [13, 9, 9]
]);

/** Output keys with the default parameters. */
const DEFAULT_OUTPUTS: [type: string, keys: string[]][] = [
  ['RSI', ['rsi6', 'rsi12', 'rsi24']],
  ['KDJ', ['k', 'd', 'j']],
  ['WR', ['wr14', 'wr28']],
  ['CCI', ['cci']],
  ['ROC', ['roc']],
  ['BIAS', ['bias6', 'bias12', 'bias24']],
  ['OBV', ['obv']],
  ['VR', ['vr']],
  ['EMV', ['emv', 'maemv']],
  ['MFI', ['mfi']],
  ['ATR', ['atr']],
  ['STD', ['std']],
  ['DMI', ['pdi', 'mdi', 'adx', 'adxr']]
];

describe('built-in indicators', () => {
  it.each(DEFAULT_OUTPUTS)('%s has the default outputs %j', (type, keys) => {
    expect(Object.keys(compute(type, createBars(5)))).toEqual(keys);
  });

  it.each(DEFAULT_OUTPUTS.map(([type]) => type))(
    '%s gives the same values incrementally and in full',
    (type) => {
      const { full, incremental } = incrementalMatchesFull(type, createBars(120));

      for (const [key, values] of Object.entries(full)) {
        expect(
          values.some((value) => !Number.isNaN(value)),
          `${key} has values`
        ).toBe(true);
        expectClose(incremental[key] ?? [], values, 9);
      }
    }
  );

  describe('RSI', () => {
    it('divides the smoothed gains by the smoothed moves', () => {
      // Δ = +1, -1, +2 from bar 1. SMA(X, 2, 1) = (X + Y') / 2, seeded with the first value:
      // gains 1, 0.5, 1.25 and moves 1, 1, 1.5 → 100, 50, 83.33.
      const values = compute('RSI', barsFromCloses([10, 11, 10, 12]), { periods: [2] });
      expectClose(values.rsi2 ?? [], [N, 100, 50, 250 / 3]);
    });

    it('is undefined until the price moves', () => {
      // Flat closes give 0 / 0; the move on bar 3 gives gains 0.5 and moves 0.5.
      const values = compute('RSI', barsFromCloses([5, 5, 5, 6]), { periods: [2] });
      expectClose(values.rsi2 ?? [], [N, N, N, 100]);
    });
  });

  describe('KDJ', () => {
    it('smooths RSV into K and D starting from 50', () => {
      // Bar 2: HHV 12, LLV 8, close 11 → RSV 75; K = (2 * 50 + 75) / 3 = 175/3,
      // D = (2 * 50 + K) / 3 = 475/9, J = 3K - 2D = 625/9.
      // Bar 3: HHV 13, LLV 9, close 9 → RSV 0; K = 2K' / 3 = 350/9, D = (2D' + K) / 3 = 1300/27.
      const values = compute('KDJ', RANGE, { period: 3, k: 3, d: 3 });
      expectClose(values.k ?? [], [N, N, 175 / 3, 350 / 9]);
      expectClose(values.d ?? [], [N, N, 475 / 9, 1300 / 27]);
      expectClose(values.j ?? [], [N, N, 625 / 9, 550 / 27]);
    });

    it('counts a flat range as RSV 50', () => {
      const values = compute('KDJ', FLAT, { period: 2, k: 3, d: 3 });
      expectClose(values.k ?? [], [N, 50, 50]);
      expectClose(values.j ?? [], [N, 50, 50]);
    });
  });

  describe('WR', () => {
    it('measures the close down from the highest high', () => {
      // Bar 2: (12 - 11) / (12 - 8) = 25%. Bar 3: (13 - 9) / (13 - 9) = 100%.
      const values = compute('WR', RANGE, { periods: [3] });
      expectClose(values.wr3 ?? [], [N, N, 25, 100]);
    });

    it('counts a flat range as 0', () => {
      expectClose(compute('WR', FLAT, { periods: [2] }).wr2 ?? [], [N, 0, 0]);
    });
  });

  describe('CCI', () => {
    const bars = barsFrom([
      [11, 9, 10],
      [13, 11, 12],
      [15, 13, 14],
      [12, 10, 11]
    ]);

    it('scales the distance from the mean typical price by the mean deviation', () => {
      // Typical prices 10, 12, 14, 11.
      // Bar 2: mean 12, mean deviation 4/3 → (14 - 12) / (0.015 * 4/3) = 100.
      // Bar 3: mean 37/3, mean deviation (1/3 + 5/3 + 4/3) / 3 = 10/9 → (-4/3) / (1/60) = -80.
      expectClose(compute('CCI', bars, { period: 3 }).cci ?? [], [N, N, 100, -80]);
    });

    it('is undefined over a flat window', () => {
      expectClose(compute('CCI', FLAT, { period: 2 }).cci ?? [], [N, N, N]);
    });
  });

  describe('ROC', () => {
    it('compares the price with the one `period` bars back', () => {
      // Bar 2: 12 / 10 - 1 = 20%. Bar 3: 30 / 20 - 1 = 50%.
      const values = compute('ROC', barsFromCloses([10, 20, 12, 30]), { period: 2 });
      expectClose(values.roc ?? [], [N, N, 20, 50]);
    });

    it('is undefined against a zero base', () => {
      const values = compute('ROC', barsFromCloses([0, 1, 2]), { period: 1 });
      expectClose(values.roc ?? [], [N, N, 100]);
    });
  });

  it('computes BIAS as the distance from the moving average', () => {
    // Bar 2: MA 11 → 1 / 11. Bar 3: MA 38/3 → (15 - 38/3) / (38/3) = 7/38.
    const values = compute('BIAS', barsFromCloses([10, 11, 12, 15]), { periods: [3] });
    expectClose(values.bias3 ?? [], [N, N, 100 / 11, 700 / 38]);
  });

  describe('OBV and VR', () => {
    // Bar 1 up (volume 200), bar 2 unchanged (300), bar 3 down (400), bar 4 up (500).
    const bars = barsFromCloses([10, 11, 11, 10, 12], [100, 200, 300, 400, 500]);

    it('accumulates OBV from the second bar', () => {
      expectClose(compute('OBV', bars).obv ?? [], [N, 200, 200, -200, 300]);
    });

    it('computes VR as (2 * up + flat) / (2 * down + flat)', () => {
      // Bar 2: (400 + 300) / 300. Bar 3: 300 / (800 + 300). Bar 4: 1000 / 800.
      expectClose(compute('VR', bars, { period: 2 }).vr ?? [], [N, N, 700 / 3, 300 / 11, 125]);
    });

    it('leaves VR undefined without down or unchanged volume', () => {
      expectClose(compute('VR', barsFromCloses([10, 11, 12]), { period: 2 }).vr ?? [], [N, N, N]);
    });
  });

  describe('EMV', () => {
    // H + L = 18, 20, 20, 25; ranges 2, 2, 4, 3; volumes 100, 300, 100, 200.
    const rows: [number, number, number, number][] = [
      [10, 8, 9, 100],
      [11, 9, 10, 300],
      [12, 8, 10, 100],
      [14, 11, 12, 200]
    ];

    it('weights the percent move of H + L by relative volume and range', () => {
      // MID from bar 1: 100 * 2 / 20 = 10, 0, 100 * 5 / 25 = 20.
      // MA(VOL, 2) / VOL: 200 / 300, 200 / 100, 150 / 200. MA(H - L, 2): 2, 3, 3.5.
      // Terms: 10 * 2/3 * 2 / 2 = 20/3, 0, 20 * 0.75 * 3 / 3.5 = 90/7.
      // EMV = MA(term, 2): 10/3, 45/7. MAEMV = MA(EMV, 2): (10/3 + 45/7) / 2 = 205/42.
      const values = compute('EMV', barsFrom(rows), { period: 2, signal: 2 });
      expectClose(values.emv ?? [], [N, N, 10 / 3, 45 / 7]);
      expectClose(values.maemv ?? [], [N, N, N, 205 / 42]);
    });

    it('is undefined while a bar without volume is in the window', () => {
      // Bar 1 has no term; bar 2 has MA(VOL, 2) / VOL = 50 / 100 but MID 0; bar 3 is unchanged.
      const bars = barsFrom(rows.map((row, index) => (index === 1 ? [11, 9, 10, 0] : row)));
      const values = compute('EMV', bars, { period: 2, signal: 2 });
      expectClose(values.emv ?? [], [N, N, N, 45 / 7]);
      expectClose(values.maemv ?? [], [N, N, N, N]);
    });

    it('has no term for a bar with H + L = 0', () => {
      // Bar 2: MID = 100 * (4 - 0) / 4, volume and range ratios 1 → 100.
      const bars = barsFrom([
        [2, 0, 1],
        [1, -1, 0],
        [3, 1, 2]
      ]);
      const values = compute('EMV', bars, { period: 1, signal: 1 });
      expectClose(values.emv ?? [], [N, N, 100]);
    });

    it('recovers incrementally once a bar without volume has left the window', () => {
      const bars = createBars(40).map((bar, index) => (index === 20 ? { ...bar, volume: 0 } : bar));
      const { full, incremental } = incrementalMatchesFull('EMV', bars, { period: 3, signal: 2 });
      const missing = (key: string) => full[key]?.slice(19, 25).map((value) => Number.isNaN(value));
      expect(missing('emv')).toEqual([false, true, true, true, false, false]);
      expect(missing('maemv')).toEqual([false, true, true, true, true, false]);

      for (const [key, values] of Object.entries(full)) {
        expectClose(incremental[key] ?? [], values, 9);
      }
    });
  });

  describe('MFI', () => {
    it('divides the positive money flow by the total', () => {
      // Typical prices 10, 12, 11, 11, 13 with volumes 100, 100, 200, 300, 100:
      // flows +1200, -2200, 0, +1300 from bar 1.
      // Bar 2: 1200 / 3400. Bar 3: 0 / 2200. Bar 4: 1300 / 1300.
      const bars = barsFrom([
        [11, 9, 10, 100],
        [13, 11, 12, 100],
        [12, 10, 11, 200],
        [12, 10, 11, 300],
        [14, 12, 13, 100]
      ]);
      expectClose(compute('MFI', bars, { period: 2 }).mfi ?? [], [N, N, 600 / 17, 0, 100]);
    });

    it('is undefined while the typical price is flat', () => {
      expectClose(compute('MFI', FLAT, { period: 1 }).mfi ?? [], [N, N, N]);
    });
  });

  it('smooths the true range into ATR from the second bar', () => {
    // TR from bar 1: max(2, 2, 0) = 2, max(2, 4, 2) = 4, max(1, 2, 3) = 3.
    // SMA(TR, 3, 1): 2, (4 + 2 * 2) / 3 = 8/3, (3 + 2 * 8/3) / 3 = 25/9.
    const bars = barsFrom([
      [11, 9, 10],
      [12, 10, 11],
      [15, 13, 14],
      [12, 11, 11]
    ]);
    expectClose(compute('ATR', bars, { period: 3 }).atr ?? [], [N, 2, 8 / 3, 25 / 9]);
  });

  it('computes STD as a population standard deviation', () => {
    // Pairs (1, 3), (3, 3), (3, 7) → half the difference.
    const values = compute('STD', barsFromCloses([1, 3, 3, 7]), { period: 2 });
    expectClose(values.std ?? [], [N, 1, 0, 2]);
  });

  it('computes DMI with Wilder smoothing', () => {
    // Bar 1: +DM 2, -DM 0, TR 3. Bar 2: +DM 0, -DM 2, TR 4. Bar 3: +DM 1, -DM 0, TR 4.
    // SMA(X, 2, 1): TR 3, 3.5, 3.75; +DM 2, 1, 1; -DM 0, 1, 0.5.
    // PDI 200/3, 200/7, 80/3; MDI 0, 200/7, 40/3; DX 100, 0, 100/3; ADX 100, 50, 125/3.
    // ADXR on bar 3 = (125/3 + ADX of bar 1) / 2.
    const bars = barsFrom([
      [10, 8, 9],
      [12, 9, 11],
      [11, 7, 8],
      [12, 8, 11]
    ]);
    const values = compute('DMI', bars, { period: 2 });
    expectClose(values.pdi ?? [], [N, 200 / 3, 200 / 7, 80 / 3]);
    expectClose(values.mdi ?? [], [N, 0, 200 / 7, 40 / 3]);
    expectClose(values.adx ?? [], [N, 100, 50, 125 / 3]);
    expectClose(values.adxr ?? [], [N, N, N, 425 / 6]);
  });
});
