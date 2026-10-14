import type { LineStyle } from '../options/types';

export interface CandleStyle {
  upColor: string;
  downColor: string;
  upWickColor: string;
  downWickColor: string;
  upBorderColor: string;
  downBorderColor: string;
  wick: boolean;
  border: boolean;
  /** Body width as a fraction of the bar spacing. */
  bodyRatio: number;
}

export interface OhlcStyle {
  upColor: string;
  downColor: string;
  lineWidth: number;
  /** Draws the open (left) and close (right) ticks. */
  ticks: boolean;
}

export interface HighLowStyle {
  upColor: string;
  downColor: string;
  lineWidth: number;
}

export interface LineSeriesStyle {
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
}

export interface LineMarkersStyle extends LineSeriesStyle {
  markerRadius: number;
}

export interface AreaStyle {
  lineColor: string;
  lineWidth: number;
  topColor: string;
  bottomColor: string;
}

export interface BaselineStyle {
  /** Values above it use the top colors. `null` uses the first visible value. */
  baseValue: number | null;
  lineWidth: number;
  topLineColor: string;
  topFillColor: string;
  bottomLineColor: string;
  bottomFillColor: string;
}

export interface HlcAreaStyle {
  highColor: string;
  lowColor: string;
  closeColor: string;
  fillColor: string;
  lineWidth: number;
}

export interface ColumnsStyle {
  upColor: string;
  downColor: string;
  /** Columns grow from this value. */
  base: number;
  /** Column width as a fraction of the bar spacing. */
  widthRatio: number;
}

/**
 * Resolved style of every series type. Plugins add their own types through declaration merging:
 *
 * ```ts
 * declare module '@trading-chart-sdk/core' {
 *   interface SeriesStyleMap { renko: { boxColor: string } }
 * }
 * ```
 */
export interface SeriesStyleMap {
  candles: CandleStyle;
  'hollow-candles': CandleStyle;
  ohlc: OhlcStyle;
  'high-low': HighLowStyle;
  line: LineSeriesStyle;
  'step-line': LineSeriesStyle;
  'line-markers': LineMarkersStyle;
  area: AreaStyle;
  baseline: BaselineStyle;
  'hlc-area': HlcAreaStyle;
  columns: ColumnsStyle;
}

export type SeriesType = keyof SeriesStyleMap;

/** Partial style overrides keyed by series type. */
export type SeriesStyleOverrides = { [K in SeriesType]?: Partial<SeriesStyleMap[K]> };
