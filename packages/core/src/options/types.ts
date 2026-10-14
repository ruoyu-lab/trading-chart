import type { PriceSource } from '../data/types';
import type { SeriesStyleOverrides, SeriesType } from '../series/styles';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

/** Colors used across the chart. Series, indicator and object styles derive their defaults from it. */
export interface Theme {
  background: string;
  text: string;
  textMuted: string;
  grid: string;
  border: string;
  crosshair: string;
  crosshairLabelBackground: string;
  crosshairLabelText: string;
  /** Bullish candles, rising values. */
  up: string;
  /** Bearish candles, falling values. */
  down: string;
  volumeUp: string;
  volumeDown: string;
  /** Selection handles and highlighted objects. */
  accent: string;
  /** Default colors for drawings, indicators and additional series, in order. */
  palette: readonly string[];
  buy: string;
  sell: string;
  alert: string;
}

export interface FontOptions {
  family: string;
  /** Axis and label font size in CSS pixels. */
  size: number;
}

export interface GridOptions {
  vertical: boolean;
  horizontal: boolean;
  style: LineStyle;
}

export interface CrosshairOptions {
  /** `magnet` snaps the horizontal line to the close of the hovered bar. */
  mode: 'magnet' | 'free';
  vertical: boolean;
  horizontal: boolean;
  /** Shows the time and price labels on the axes. */
  labels: boolean;
  style: LineStyle;
}

/** Formats a time label. `kind` tells where the label is shown. */
export type TimeFormatter = (time: number, context: TimeFormatContext) => string;

export interface TimeFormatContext {
  kind: 'axis' | 'crosshair';
  /** For axis labels: the calendar boundary the tick sits on. */
  unit: TimeUnit;
  locale: string | undefined;
  timeZone: string | undefined;
}

export type TimeUnit = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

/** Formats a price label. `value` is already converted for percent/indexed scales. */
export type PriceFormatter = (value: number, context: PriceFormatContext) => string;

export interface PriceFormatContext {
  paneId: string;
  mode: PriceScaleMode;
  precision: number;
  locale: string | undefined;
}

export type PriceScaleMode = 'normal' | 'log' | 'percent' | 'indexed';

export interface PriceScaleOptions {
  visible: boolean;
  /** Empty space above and below the auto-scaled range, as a fraction of the pane height. */
  margins: { top: number; bottom: number };
  /** Decimals of main-series prices, or `auto` to infer them from the data. */
  precision: number | 'auto';
  formatter: PriceFormatter | null;
  /** Minimum axis width in CSS pixels; the axis grows to fit its labels. */
  minWidth: number;
}

export interface TimeScaleOptions {
  visible: boolean;
  /** Axis height in CSS pixels. */
  height: number;
  /** Initial distance between bars in CSS pixels. */
  barSpacing: number;
  minBarSpacing: number;
  maxBarSpacing: number;
  /** Empty space after the latest bar, in CSS pixels, when the chart follows real time. */
  rightOffset: number;
  /** `loadMore` fires when fewer than this many bars remain hidden on the left. */
  loadMoreThreshold: number;
  formatter: TimeFormatter | null;
}

export interface LatestPriceOptions {
  line: boolean;
  label: boolean;
  /** Shows the time left until the current bar closes under the price label. */
  countdown: boolean;
  style: LineStyle;
}

export interface LegendOptions {
  /** Shows the OHLC values and indicator values of the hovered (or latest) bar in each pane. */
  visible: boolean;
}

export interface InteractionOptions {
  /** Drag the plot to scroll through time. */
  pan: boolean;
  /** Mouse wheel and trackpad zoom. */
  wheelZoom: boolean;
  /** Two-finger pinch zoom on touch screens. */
  pinchZoom: boolean;
  /** Drag the axes to scale them; double-click the price axis to reset auto-scale. */
  axisScale: boolean;
  /** Keeps scrolling briefly after a quick pan is released. */
  kineticScroll: boolean;
  /** Arrow keys, +/-, Delete, Escape and undo/redo shortcuts while the chart has focus. */
  keyboard: boolean;
  /** Touch press duration that switches a touch into crosshair mode. */
  longPressMs: number;
}

export interface PaneOptions {
  /** Height in CSS pixels of a newly created pane. */
  defaultHeight: number;
  /** Panes never shrink below this height while resizing. */
  minHeight: number;
  /** Height of the draggable separator between panes. */
  separatorHeight: number;
}

export interface DrawingOptions {
  /** Snaps tool and handle points to the nearest OHLC value of the hovered bar. */
  magnet: boolean;
  /** Pointer distance in CSS pixels that counts as a hit on a drawing. */
  hitTolerance: number;
  handleRadius: number;
}

export interface PerformanceOptions {
  /** Caps the canvas pixel ratio to limit memory use on very dense screens. */
  maxPixelRatio: number;
}

export interface MainSeriesOptions {
  /** A built-in series type such as `candles`, `line` or `area`, or a registered custom type. */
  type: SeriesType;
  /** The price a line-like main series plots. */
  source: PriceSource;
  /** Style overrides keyed by series type, so switching types keeps each type's style. */
  styles: SeriesStyleOverrides;
}

export interface ChartOptions {
  /** Follows the container size with a `ResizeObserver`. When false, call `chart.resize()`. */
  autoSize: boolean;
  /** BCP 47 locale for numbers and dates. `undefined` uses the runtime default. */
  locale: string | undefined;
  /** IANA time zone such as `Asia/Shanghai`. `undefined` uses the local time zone. */
  timeZone: string | undefined;
  theme: Theme;
  font: FontOptions;
  grid: GridOptions;
  crosshair: CrosshairOptions;
  mainSeries: MainSeriesOptions;
  timeScale: TimeScaleOptions;
  priceScale: PriceScaleOptions;
  latestPrice: LatestPriceOptions;
  legend: LegendOptions;
  interaction: InteractionOptions;
  panes: PaneOptions;
  drawings: DrawingOptions;
  performance: PerformanceOptions;
}
