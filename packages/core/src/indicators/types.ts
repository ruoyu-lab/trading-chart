import type { Bar, PriceSource } from '../data/types';

/** Constraints of a numeric parameter. Array defaults accept several values, such as MA periods. */
export interface ParamSpec {
  default: number | readonly number[];
  min?: number;
  max?: number;
  integer?: boolean;
  /** Shown in the legend and in parameter UIs. Defaults to the parameter key. */
  label?: string;
}

export type ParamValues = Record<string, number | readonly number[]>;

export type IndicatorPlot =
  /** A polyline. */
  | { readonly kind: 'line'; readonly style?: 'solid' | 'dashed' | 'dotted' }
  /** Columns from zero, colored by the sign of the value, its change, or the bar direction. */
  | { readonly kind: 'histogram'; readonly colorBy: 'sign' | 'change' | 'bar' }
  /** Not drawn; only shown in the legend and available to alerts. */
  | { readonly kind: 'hidden' };

export interface IndicatorOutput {
  readonly key: string;
  readonly label: string;
  readonly plot: IndicatorPlot;
  /** Fixed color. Lines without one take theme palette colors in order. */
  readonly color?: string;
}

/** Shades the area between two outputs, such as Bollinger Bands. */
export interface IndicatorFill {
  readonly from: string;
  readonly to: string;
}

/**
 * Incremental calculator. `next()` consumes one bar and returns one value per output (`NaN` while
 * warming up). The engine may call `clone()` to keep a checkpoint, so every state must be copied.
 *
 * `bar` is reused between calls and must not be retained; `price` is the configured source price.
 */
export interface IndicatorStream {
  next(bar: Bar, price: number): ArrayLike<number>;
  clone(): IndicatorStream;
}

/** A window of the most recent bars, oldest first. */
export interface BarWindow {
  readonly length: number;
  bar(index: number): Bar;
  price(index: number): number;
}

interface IndicatorDefinitionBase<P extends ParamValues> {
  /** Display name, such as `MACD`. */
  readonly name: string;
  /** Overlays share the main pane; oscillators get a pane of their own by default. */
  readonly pane: 'main' | 'new';
  readonly params: { readonly [K in keyof P]: ParamSpec };
  outputs(params: P): readonly IndicatorOutput[];
  /** Horizontal reference lines, such as RSI 30/70. */
  levels?(params: P): readonly number[];
  readonly fills?: readonly IndicatorFill[];
  /**
   * Decimals of the values, `price` to follow the main series precision, or `volume` for compact
   * notation such as `1.25M`.
   */
  readonly precision: number | 'price' | 'volume';
  /** Fixed scale range of the pane, such as 0..100 for RSI. */
  readonly range?: { readonly min: number; readonly max: number };
}

/**
 * An indicator type. Implement either `create()` for full incremental control, or `lookback` and
 * `compute()` to derive each value from the latest bars only.
 */
export type IndicatorDefinition<P extends ParamValues = ParamValues> = IndicatorDefinitionBase<P> &
  (
    | { create(params: P): IndicatorStream }
    | {
        lookback(params: P): number;
        compute(window: BarWindow, params: P): ArrayLike<number>;
      }
  );

export interface IndicatorInput {
  /** Generated when omitted. */
  id?: string;
  type: string;
  /** Overrides of the definition's parameter defaults. */
  params?: ParamValues;
  /** `main`, `new` (a pane of its own) or the id of an existing pane. */
  pane?: string;
  /** Price passed to the calculator. Defaults to `close`. */
  source?: PriceSource;
  visible?: boolean;
  /** Color overrides keyed by output key. */
  colors?: Record<string, string>;
}

export interface Indicator {
  readonly id: string;
  readonly type: string;
  readonly params: ParamValues;
  readonly pane: string;
  readonly source: PriceSource;
  readonly visible: boolean;
  readonly colors: Readonly<Record<string, string>>;
}

export interface IndicatorValue {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly value: number | null;
  /** Formatted with the indicator precision. */
  readonly text: string;
}
