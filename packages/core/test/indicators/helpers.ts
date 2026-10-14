import { expect } from 'vitest';
import { BarStore } from '../../src/data/bar-store';
import type { BarInput } from '../../src/data/types';
import { createIndicatorRegistry } from '../../src/indicators/built-in';
import { IndicatorSeries, resolveParams } from '../../src/indicators/instance';
import type { IndicatorDefinition, ParamValues } from '../../src/indicators/types';

export function definitionOf(type: string): IndicatorDefinition {
  return createIndicatorRegistry().require(type);
}

/** Computes an indicator over `bars` and returns its columns keyed by output key. */
export function compute(
  type: string,
  bars: readonly BarInput[],
  params?: ParamValues
): Record<string, number[]> {
  const store = new BarStore();
  store.set(bars);
  return computeOn(store, type, params);
}

export function createSeries(
  store: BarStore,
  type: string,
  params?: ParamValues
): { series: IndicatorSeries; keys: string[] } {
  const definition = definitionOf(type);
  const resolved = resolveParams(definition, params, type);
  const outputs = definition.outputs(resolved);
  return {
    series: new IndicatorSeries(store, definition, resolved, outputs, 'close'),
    keys: outputs.map((output) => output.key)
  };
}

export function read(
  series: IndicatorSeries,
  keys: string[],
  length: number
): Record<string, number[]> {
  series.sync();
  return Object.fromEntries(
    keys.map((key, column) => [
      key,
      Array.from({ length }, (_, index) => series.value(column, index))
    ])
  );
}

export function computeOn(
  store: BarStore,
  type: string,
  params?: ParamValues
): Record<string, number[]> {
  const { series, keys } = createSeries(store, type, params);
  return read(series, keys, store.length);
}

/** Bars from a list of closes; open is the previous close, high/low enclose both. */
export function barsFromCloses(closes: readonly number[], volumes?: readonly number[]): BarInput[] {
  return closes.map((close, index) => {
    const open = index === 0 ? close : (closes[index - 1] ?? close);
    return {
      time: Date.UTC(2024, 0, 1) + index * 60_000,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: volumes?.[index] ?? 100 + index
    };
  });
}

/**
 * Asserts that feeding bars one by one (with intermediate updates of the last bar) yields the same
 * values as computing over the full history at once.
 */
export function incrementalMatchesFull(
  type: string,
  bars: readonly BarInput[],
  params?: ParamValues
): { full: Record<string, number[]>; incremental: Record<string, number[]> } {
  const full = compute(type, bars, params);
  const store = new BarStore();
  const { series, keys } = createSeries(store, type, params);

  bars.forEach((bar, index) => {
    // Simulate a tick on the forming bar before its final value arrives.
    store.update([{ ...bar, close: bar.low, open: bar.low, high: bar.high, low: bar.low }]);
    series.sync();
    store.update([bar]);

    if (index % 7 === 0) {
      series.sync();
    }
  });

  return { full, incremental: read(series, keys, store.length) };
}

/** Asserts equal lengths and that each value is `NaN` where expected, or close to the target. */
export function expectClose(actual: number[], expected: number[], digits = 6): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    const target = expected[index] ?? Number.NaN;

    if (Number.isNaN(target)) {
      expect(value, `index ${index}`).toBeNaN();
    } else {
      expect(value, `index ${index}`).toBeCloseTo(target, digits);
    }
  });
}
