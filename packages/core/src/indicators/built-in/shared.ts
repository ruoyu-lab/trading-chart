import type { Bar } from '../../data/types';
import type { IndicatorOutput, IndicatorStream, ParamSpec } from '../types';

/** A primitive that maps one input value per bar to one output value. */
export interface Step {
  next(value: number): number;
  clone(): Step;
}

/** Passes the input through unchanged. */
export const IDENTITY: Step = {
  next: (value) => value,
  clone: () => IDENTITY
};

/** Feeds the same input into several primitives, one output each. */
export class ParallelStream implements IndicatorStream {
  private readonly out: Float64Array;

  constructor(
    private readonly steps: readonly Step[],
    private readonly input: (bar: Bar, price: number) => number
  ) {
    this.out = new Float64Array(steps.length);
  }

  next(bar: Bar, price: number): ArrayLike<number> {
    const value = this.input(bar, price);
    this.steps.forEach((step, index) => {
      this.out[index] = step.next(value);
    });
    return this.out;
  }

  clone(): IndicatorStream {
    return new ParallelStream(
      this.steps.map((step) => step.clone()),
      this.input
    );
  }
}

/** A line keyed by its lower-cased label, such as `rsi6` for `RSI6`. */
export function lineOutput(label: string): IndicatorOutput {
  return { key: label.toLowerCase(), label, plot: { kind: 'line' } };
}

export function lineOutputs(prefix: string, periods: readonly number[]): IndicatorOutput[] {
  return periods.map((period) => lineOutput(`${prefix}${period}`));
}

/** A whole-number lookback, such as the RSI period. */
export function periodParam(value: number, label = 'Period'): ParamSpec {
  return { default: value, min: 1, max: 2000, integer: true, label };
}

/** Several lookbacks with one output each, such as MA5 and MA10. */
export function periodsParam(values: readonly number[]): ParamSpec {
  return { default: values, min: 1, max: 2000, integer: true, label: 'Periods' };
}

/** `numerator / denominator`, or `NaN` when the denominator is zero. */
export function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? Number.NaN : numerator / denominator;
}
