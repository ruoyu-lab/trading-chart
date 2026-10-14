import type { BarStore } from '../data/bar-store';
import type { Formatter } from '../format/formatter';
import type { DragSession, HitTarget, ObjectKind, Point } from '../interaction/types';
import type { ChartOptions } from '../options/types';
import type { Frame, PaneFrame } from '../render/frame';
import type { TimeScale } from '../scales/time-scale';

/** The single selected object of a chart. */
export interface Selection {
  readonly kind: ObjectKind;
  readonly id: string;
}

export interface ObjectContext {
  readonly frame: Frame;
  readonly bars: BarStore;
  readonly timeScale: TimeScale;
  readonly options: ChartOptions;
  readonly formatter: Formatter;
  readonly selection: Selection | null;
  readonly hovered: HitTarget | null;
  /** Width of `text` in CSS pixels at `size` with the chart font. */
  readonly measureText: (text: string, size: number) => number;
}

export interface ObjectPaintContext extends ObjectContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly pixelRatio: number;
}

export interface ObjectHit {
  readonly target: HitTarget;
  /** Higher wins: buttons and handles beat labels, labels beat lines. */
  readonly priority: number;
  readonly distance: number;
}

/** Hit priorities shared by every object kind. */
export const HitPriority = {
  button: 50,
  handle: 40,
  label: 30,
  line: 20,
  body: 10
} as const;

/** One kind of chart object: drawings, orders, alerts or markers. */
export interface ObjectDomain {
  readonly kind: ObjectKind;
  hitTest(context: ObjectContext, point: Point): ObjectHit | null;
  paint(context: ObjectPaintContext): void;
  beginDrag(context: ObjectContext, target: HitTarget, point: Point): DragSession | null;
  has(id: string): boolean;
}

/** x of a time in plot coordinates, interpolated and extrapolated between bars. */
export function timeToX(context: Pick<ObjectContext, 'bars' | 'timeScale'>, time: number): number {
  return context.timeScale.indexToX(context.bars.logicalIndexOf(time));
}

export function paneOf(frame: Frame, paneId: string): PaneFrame | undefined {
  return frame.panes.find((pane) => pane.id === paneId);
}
