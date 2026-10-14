export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The part of the chart under a point. */
export type Region =
  | { readonly kind: 'plot'; readonly paneId: string }
  | { readonly kind: 'price-axis'; readonly paneId: string }
  | { readonly kind: 'time-axis' }
  | { readonly kind: 'separator'; readonly above: string; readonly below: string }
  | { readonly kind: 'outside' };

export type ObjectKind = 'drawing' | 'order' | 'alert' | 'marker';

/** An object under the pointer. */
export interface HitTarget {
  readonly kind: ObjectKind;
  readonly id: string;
  /** The part that was hit, such as `line`, `label`, `handle:0` or `button:close`. */
  readonly part: string;
  /** CSS cursor while hovering it. */
  readonly cursor: string;
  readonly draggable: boolean;
}

/** An object drag in progress. */
export interface DragSession {
  move(point: Point): void;
  /** Keeps the result. */
  end(): void;
  /** Restores the state from before the drag. */
  cancel(): void;
}

/** A drawing tool placing points. */
export interface ToolSession {
  pointerDown(point: Point): void;
  pointerMove(point: Point): void;
  pointerUp(point: Point): void;
  doubleClick(point: Point): void;
}

export interface PaneResizeSession {
  /** Total vertical movement since the drag started. */
  move(deltaY: number): void;
  end(): void;
  /** Restores the heights from before the drag. */
  cancel(): void;
}

/** What the input controller asks the chart to do. */
export interface InteractionHost {
  readonly root: HTMLElement;
  enabled(
    feature: 'pan' | 'wheelZoom' | 'pinchZoom' | 'axisScale' | 'kineticScroll' | 'keyboard'
  ): boolean;
  longPressMs(): number;
  plotWidth(): number;
  regionAt(point: Point): Region;
  setPointer(point: Point | null): void;
  hitTest(point: Point): HitTarget | null;
  hover(target: HitTarget | null): void;
  beginDrag(target: HitTarget, point: Point): DragSession | null;
  activeTool(): ToolSession | null;
  click(point: Point, target: HitTarget | null): void;
  doubleClick(point: Point, region: Region): void;
  /** Returns whether the browser menu should be suppressed. */
  contextMenu(point: Point, target: HitTarget | null, event: MouseEvent): boolean;
  scrollTime(deltaX: number): void;
  zoomTime(factor: number, anchorX: number): void;
  isAutoScale(paneId: string): boolean;
  panPrice(paneId: string, deltaY: number): void;
  zoomPrice(paneId: string, factor: number, anchorY: number): void;
  beginPaneResize(above: string, below: string): PaneResizeSession;
  /** Escape: cancels the tool or clears the selection. */
  escape(): void;
  deleteSelection(): void;
  undo(): void;
  redo(): void;
  scrollToRealTime(): void;
}
