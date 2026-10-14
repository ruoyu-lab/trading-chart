import type { PriceSource } from '../data/types';
import type { LineStyle } from '../options/types';
import type { PriceLineButton } from '../trading/price-line';

/** A value an alert watches or compares against. */
export type ValueSource =
  | { readonly kind: 'price'; readonly field?: PriceSource }
  | { readonly kind: 'indicator'; readonly id: string; readonly key: string }
  | { readonly kind: 'series'; readonly id: string };

/**
 * - `cross-up` / `cross-down` / `cross`: the source moves through the threshold between two
 *   evaluations (ticks or bars).
 * - `above` / `below`: the source is beyond the threshold.
 */
export type AlertTrigger = 'cross' | 'cross-up' | 'cross-down' | 'above' | 'below';

/**
 * - `once`: fires one time, then the alert's status becomes `triggered` until `rearm()`.
 * - `once-per-bar`: at most once per bar, on the tick that meets the condition.
 * - `once-per-bar-close`: evaluates closed bars only, when the next bar starts.
 * - `every-time`: whenever an evaluation meets the condition.
 */
export type AlertFrequency = 'once' | 'once-per-bar' | 'once-per-bar-close' | 'every-time';

export interface AlertInput {
  id: string;
  /** Watched value; defaults to the main close. */
  source?: ValueSource;
  trigger: AlertTrigger;
  /** A fixed level (drawn as a draggable line) or another value to compare with. */
  value: number | ValueSource;
  frequency?: AlertFrequency;
  enabled?: boolean;
  /** Text of the line label. */
  label?: string;
  /** Defaults to the theme's alert color. */
  color?: string;
  lineStyle?: LineStyle;
  /** Lets the user drag a fixed level. Default `true`. */
  draggable?: boolean;
  /** Shows the line of a fixed level. Default `true`. */
  visible?: boolean;
  buttons?: PriceLineButton[];
}

export type AlertStatus = 'active' | 'triggered' | 'disabled';

export interface Alert {
  readonly id: string;
  readonly source: ValueSource;
  readonly trigger: AlertTrigger;
  readonly value: number | ValueSource;
  readonly frequency: AlertFrequency;
  readonly enabled: boolean;
  readonly label: string | null;
  readonly color: string | null;
  readonly lineStyle: LineStyle;
  readonly draggable: boolean;
  readonly visible: boolean;
  readonly buttons: readonly PriceLineButton[];
  readonly status: AlertStatus;
  /** Time of the bar on which the alert last fired. */
  readonly triggeredAt: number | null;
}

export interface AlertTriggerEvent {
  readonly id: string;
  /** Time of the bar that met the condition. */
  readonly time: number;
  readonly value: number;
  readonly threshold: number;
  readonly trigger: AlertTrigger;
}
