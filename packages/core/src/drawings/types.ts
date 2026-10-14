import type { TimeInput } from '../data/time';
import type { Point } from '../interaction/types';
import type { LineStyle, Theme } from '../options/types';

export interface DrawingPointInput {
  time: TimeInput;
  price: number;
}

/** An anchor of a drawing: a time (epoch milliseconds) and a value of its pane. */
export interface DrawingPoint {
  readonly time: number;
  readonly price: number;
}

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  /** Fill of closed shapes such as rectangles and channels. */
  fillColor: string;
  textColor: string;
  fontSize: number;
}

export interface DrawingInput {
  /** Generated when omitted. */
  id?: string;
  /** A built-in type such as `trend-line` or `fib-retracement`, or a registered custom type. */
  type: string;
  /** Pane id; defaults to `main`. */
  pane?: string;
  points: readonly DrawingPointInput[];
  style?: Partial<DrawingStyle>;
  text?: string;
  /** Locked drawings can be selected but not moved. */
  locked?: boolean;
  visible?: boolean;
}

export interface Drawing {
  readonly id: string;
  readonly type: string;
  readonly pane: string;
  readonly points: readonly DrawingPoint[];
  /** The style overrides given for this drawing. */
  readonly style: Readonly<Partial<DrawingStyle>>;
  readonly text: string;
  readonly locked: boolean;
  readonly visible: boolean;
}

/** Pixel geometry of a drawing passed to its type definition. Coordinates are plot-relative. */
export interface DrawingGeometry {
  /** Anchors in plot coordinates, in the order they were placed. */
  readonly points: readonly Point[];
  /** Anchors in data coordinates. */
  readonly anchors: readonly DrawingPoint[];
  readonly width: number;
  readonly height: number;
  readonly style: DrawingStyle;
  readonly text: string;
  readonly theme: Theme;
  readonly fontFamily: string;
  readonly valueToY: (value: number) => number;
  /** Formats a value with the pane's precision, e.g. for fib level labels. */
  readonly formatValue: (value: number) => string;
  /** Width of `text` in CSS pixels at the drawing's font size. */
  readonly measureText: (text: string) => number;
}

export interface DrawingPaintContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly pixelRatio: number;
  readonly geometry: DrawingGeometry;
  readonly hovered: boolean;
  readonly selected: boolean;
}

export interface DrawingHit {
  /** `line` or `body`; anchor handles are hit-tested by the chart. */
  readonly part: 'line' | 'body';
  readonly distance: number;
}

/** Describes a drawing tool. Register custom tools with `chart.drawings.registerType()`. */
export interface DrawingTypeDefinition {
  /** Anchors the user places; `0` means any number, finished with a double click or Enter. */
  readonly points: number;
  /** Style defaults on top of the chart's drawing defaults. */
  defaultStyle?(theme: Theme): Partial<DrawingStyle>;
  paint(context: DrawingPaintContext): void;
  hitTest(geometry: DrawingGeometry, point: Point, tolerance: number): DrawingHit | null;
}
