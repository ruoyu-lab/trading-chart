import type { TimeInput } from './time';

/** A candlestick as accepted by the data APIs. */
export interface BarInput {
  time: TimeInput;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Defaults to `0`. */
  volume?: number;
}

/** A normalized candlestick. `time` is epoch milliseconds. */
export interface Bar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Price fields a line-like series or an indicator can read from a bar. */
export type PriceSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4';

/** How the bars changed since a revision a consumer has seen. */
export type BarChange =
  /** Every index may have changed (set, prepend or clear). */
  | { readonly kind: 'reset' }
  /** Only bars from `from` (inclusive) to the end changed or were appended. */
  | { readonly kind: 'tail'; readonly from: number };
