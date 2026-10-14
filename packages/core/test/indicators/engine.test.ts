import { describe, expect, it } from 'vitest';
import { BarStore } from '../../src/data/bar-store';
import { resolveParams } from '../../src/indicators/instance';
import { createBars } from '../helpers/bars';
import {
  barsFromCloses,
  compute,
  createSeries,
  definitionOf,
  expectClose,
  incrementalMatchesFull,
  read
} from './helpers';

describe('indicator engine', () => {
  it('computes MA with a warm-up period', () => {
    const values = compute('MA', barsFromCloses([1, 2, 3, 4, 5]), { periods: [3] });
    expectClose(values.ma3 ?? [], [Number.NaN, Number.NaN, 2, 3, 4]);
  });

  it('seeds EMA with the first value', () => {
    const values = compute('EMA', barsFromCloses([10, 20, 30]), { periods: [3] });
    // alpha = 0.5: 10, 15, 22.5
    expectClose(values.ema3 ?? [], [10, 15, 22.5]);
  });

  it('computes MACD with a doubled histogram', () => {
    const values = compute('MACD', barsFromCloses([10, 12, 11]), { fast: 1, slow: 3, signal: 1 });
    // fast EMA(1) = price; slow EMA(3) alpha 0.5: 10, 11, 11 → dif 0, 1, 0; dea = dif; macd 0.
    expectClose(values.dif ?? [], [0, 1, 0]);
    expectClose(values.macd ?? [], [0, 0, 0]);
  });

  it('computes BOLL with a population standard deviation', () => {
    const values = compute('BOLL', barsFromCloses([2, 4, 4, 4, 5, 5, 7, 9]), {
      period: 8,
      multiplier: 2
    });
    expect(values.mid?.[7]).toBeCloseTo(5);
    expect(values.upper?.[7]).toBeCloseTo(9);
    expect(values.lower?.[7]).toBeCloseTo(1);
  });

  it('computes VOL with volume moving averages', () => {
    const values = compute('VOL', barsFromCloses([1, 1, 1], [10, 20, 30]), { periods: [2] });
    expectClose(values.volume ?? [], [10, 20, 30]);
    expectClose(values.ma2 ?? [], [Number.NaN, 15, 25]);
  });

  it.each(['MA', 'EMA', 'SMMA', 'BOLL', 'VOL', 'MACD'])(
    '%s gives the same values incrementally and in full',
    (type) => {
      const { full, incremental } = incrementalMatchesFull(type, createBars(120));

      for (const [key, values] of Object.entries(full)) {
        expectClose(incremental[key] ?? [], values, 9);
      }
    }
  );

  it('recomputes after history is prepended', () => {
    const bars = createBars(60);
    const store = new BarStore();
    store.set(bars.slice(30));
    const { series, keys } = createSeries(store, 'MA', { periods: [5] });
    read(series, keys, store.length);
    store.prepend(bars.slice(0, 30));

    expectClose(
      read(series, keys, store.length).ma5 ?? [],
      compute('MA', bars, { periods: [5] }).ma5 ?? []
    );
  });

  it('validates parameters', () => {
    const definition = definitionOf('MACD');

    expect(() => resolveParams(definition, { fast: 0 }, 'MACD')).toThrow(
      'params.fast must be at least 1'
    );
    expect(() => resolveParams(definition, { speed: 3 }, 'MACD')).toThrow(
      'has no parameter "speed"'
    );
    expect(() => resolveParams(definitionOf('MA'), { periods: [] }, 'MA')).toThrow(
      /list of 1 to 8/
    );
    expect(resolveParams(definition, { fast: 5 }, 'MACD')).toEqual({
      fast: 5,
      slow: 26,
      signal: 9
    });
  });
});
