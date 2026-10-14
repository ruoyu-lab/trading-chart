import type { AlertTriggerEvent } from '../alerts/types';
import type { DrawingsChangeReason } from '../drawings/drawings-domain';
import type { PriceDragEvent } from '../trading/orders';
import type { ObjectKind } from '../interaction/types';
import type { Selection } from '../objects/types';
import type { LogicalRange } from '../scales/time-scale';
import type { CrosshairState } from './cursor';

export interface TimeRange {
  /** Time of the first visible bar. */
  readonly from: number;
  /** Time of the last visible bar. */
  readonly to: number;
}

/** The pointer moved over the chart (`visible: true`) or left it. */
export type CrosshairMoveEvent =
  ({ readonly visible: true } & CrosshairState) | { readonly visible: false };

export interface VisibleRangeChangeEvent {
  /** Times of the first and last visible bars, or `null` when no bar is visible. */
  readonly range: TimeRange | null;
  readonly logicalRange: LogicalRange | null;
}

/** The view approaches the oldest bar: load bars before `before` and pass them to `data.prepend()`. */
export interface LoadMoreEvent {
  readonly before: number;
}

/** The object under the pointer when it was clicked. */
export interface ObjectTarget {
  readonly kind: ObjectKind;
  readonly id: string;
  /** The part that was hit, such as `line`, `label`, `handle:0` or `button:close`. */
  readonly part: string;
}

/** A click, double click or context menu on the chart. */
export interface ChartPointerEvent {
  /** CSS pixel position inside the chart. */
  readonly x: number;
  readonly y: number;
  readonly paneId: string | null;
  /** Logical bar index under the pointer. */
  readonly index: number | null;
  readonly time: number | null;
  readonly price: number | null;
  readonly target: ObjectTarget | null;
}

/** The user changed the selection by clicking. */
export interface SelectionChangeEvent {
  readonly selection: Selection | null;
}

/** The user finished resizing a pane by dragging a separator. */
export interface PaneResizeEvent {
  readonly paneId: string;
  readonly height: number;
}

/** The user created, edited or removed drawings, or undid/redid such a change. */
export interface DrawingsChangeEvent {
  readonly reason: DrawingsChangeReason;
  /** Drawings created, edited or removed; empty for undo and redo, which may affect several. */
  readonly ids: readonly string[];
}

/** The drawing tool ended because the user finished or cancelled it. */
export interface ToolChangeEvent {
  /** Always `null`: tools are only started through the API. */
  readonly tool: string | null;
}

/** A button in an order or alert label was clicked. */
export interface ButtonClickEvent {
  readonly kind: 'order' | 'alert';
  readonly id: string;
  readonly buttonId: string;
}

export interface ChartEventMap {
  crosshairMove: CrosshairMoveEvent;
  visibleRangeChange: VisibleRangeChangeEvent;
  loadMore: LoadMoreEvent;
  click: ChartPointerEvent;
  doubleClick: ChartPointerEvent;
  /** Listening suppresses the browser's context menu over the chart. */
  contextMenu: ChartPointerEvent;
  selectionChange: SelectionChangeEvent;
  paneResize: PaneResizeEvent;
  drawingsChange: DrawingsChangeEvent;
  toolChange: ToolChangeEvent;
  /** The user drags an order line; the order follows immediately and keeps the final price. */
  orderDrag: PriceDragEvent;
  /** The user drags an alert level; the alert follows immediately and keeps the final level. */
  alertDrag: PriceDragEvent;
  buttonClick: ButtonClickEvent;
  alertTrigger: AlertTriggerEvent;
}
