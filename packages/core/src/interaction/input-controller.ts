import type {
  DragSession,
  HitTarget,
  InteractionHost,
  PaneResizeSession,
  Point,
  Region
} from './types';

const MOUSE_SLOP = 3;
const TOUCH_SLOP = 8;
const WHEEL_ZOOM_SPEED = 0.0018;
const PINCH_WHEEL_SPEED = 0.012;
const AXIS_DRAG_SPEED = 0.006;
const KINETIC_MIN_SPEED = 0.15;
const KINETIC_STOP_SPEED = 0.02;
const KINETIC_DECAY_MS = 325;
const VELOCITY_WINDOW_MS = 80;
const KEY_ZOOM = 1.15;

type Gesture =
  | { readonly kind: 'idle' }
  /** Pressed but not moved yet: becomes a click, a drag or (touch) a long press. */
  | {
      readonly kind: 'pressed';
      readonly pointerId: number;
      readonly touch: boolean;
      readonly start: Point;
      readonly region: Region;
      readonly target: HitTarget | null;
    }
  | {
      readonly kind: 'pan';
      readonly pointerId: number;
      /** Touch pans do not show the crosshair. */
      readonly touch: boolean;
      readonly paneId: string | null;
      last: Point;
      samples: Array<{ x: number; time: number }>;
    }
  | {
      readonly kind: 'drag';
      readonly pointerId: number;
      readonly touch: boolean;
      readonly session: DragSession;
    }
  | { readonly kind: 'time-axis'; readonly pointerId: number; lastX: number }
  | {
      readonly kind: 'price-axis';
      readonly pointerId: number;
      readonly paneId: string;
      readonly anchorY: number;
      lastY: number;
    }
  | {
      readonly kind: 'separator';
      readonly pointerId: number;
      readonly startY: number;
      readonly session: PaneResizeSession;
    }
  | { readonly kind: 'touch-crosshair'; readonly pointerId: number }
  | { readonly kind: 'pinch'; distance: number; center: number }
  | { readonly kind: 'tool'; readonly pointerId: number };

const IDLE: Gesture = { kind: 'idle' };

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/** Pixel deltas of a wheel event, whatever unit the device reports in. */
function wheelPixels(event: WheelEvent, pageHeight: number): { x: number; y: number } {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
}

/**
 * Turns pointer, touch, wheel and keyboard input into chart intents. Every gesture can be
 * cancelled (pointercancel, lost capture, window blur, Escape), which reverts object drags.
 * Hover hit-testing and wheel zooming are coalesced to one update per animation frame.
 */
export class InputController {
  private gesture: Gesture = IDLE;
  private readonly touches = new Map<number, Point>();
  private hoverPoint: Point | null = null;
  private hoverFrame = 0;
  private wheel = { x: 0, y: 0, pinch: 0, point: { x: 0, y: 0 } as Point, frame: 0 };
  private kinetic = { velocity: 0, time: 0, frame: 0 };
  private longPressTimer = 0;
  private readonly root: HTMLElement;

  constructor(
    private readonly host: InteractionHost,
    private readonly view: Window
  ) {
    this.root = host.root;
    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerup', this.onPointerUp);
    this.root.addEventListener('pointercancel', this.onPointerCancel);
    this.root.addEventListener('lostpointercapture', this.onPointerCancel);
    this.root.addEventListener('pointerleave', this.onPointerLeave);
    this.root.addEventListener('wheel', this.onWheel, { passive: false });
    this.root.addEventListener('dblclick', this.onDoubleClick);
    this.root.addEventListener('contextmenu', this.onContextMenu);
    this.root.addEventListener('keydown', this.onKeyDown);
    this.view.addEventListener('blur', this.onWindowBlur);
  }

  destroy(): void {
    this.cancelGesture();
    this.stopKinetic();
    this.view.cancelAnimationFrame(this.hoverFrame);
    this.view.cancelAnimationFrame(this.wheel.frame);
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('pointercancel', this.onPointerCancel);
    this.root.removeEventListener('lostpointercapture', this.onPointerCancel);
    this.root.removeEventListener('pointerleave', this.onPointerLeave);
    this.root.removeEventListener('wheel', this.onWheel);
    this.root.removeEventListener('dblclick', this.onDoubleClick);
    this.root.removeEventListener('contextmenu', this.onContextMenu);
    this.root.removeEventListener('keydown', this.onKeyDown);
    this.view.removeEventListener('blur', this.onWindowBlur);
  }

  /** Cancels the gesture in progress, reverting an object drag. */
  cancelGesture(): void {
    const gesture = this.gesture;
    this.clearLongPress();
    this.gesture = IDLE;

    if (gesture.kind === 'drag') {
      gesture.session.cancel();
    } else if (gesture.kind === 'separator') {
      gesture.session.cancel();
    } else if (gesture.kind === 'touch-crosshair') {
      this.host.setPointer(null);
    }

    this.updateCursor(null, null);
  }

  // ─── Pointer events ────────────────────────────────────────────────────────

  private local(event: MouseEvent): Point {
    const rect = this.root.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    this.stopKinetic();
    this.root.focus({ preventScroll: true });
    const point = this.local(event);
    const touch = event.pointerType === 'touch';

    if (touch) {
      this.touches.set(event.pointerId, point);

      if (this.touches.size === 2) {
        this.startPinch();
        return;
      }

      if (this.touches.size > 2) {
        return;
      }
    }

    if (this.gesture.kind !== 'idle') {
      return;
    }

    if (event.isTrusted) {
      this.root.setPointerCapture(event.pointerId);
    }

    const tool = this.host.activeTool();
    const region = this.host.regionAt(point);

    if (tool && region.kind === 'plot') {
      this.gesture = { kind: 'tool', pointerId: event.pointerId };
      tool.pointerDown(point);
      return;
    }

    this.startPress(event.pointerId, touch, point, region);
  };

  private startPress(pointerId: number, touch: boolean, point: Point, region: Region): void {
    if (region.kind === 'separator') {
      this.gesture = {
        kind: 'separator',
        pointerId,
        startY: point.y,
        session: this.host.beginPaneResize(region.above, region.below)
      };
      return;
    }

    if (region.kind === 'time-axis' && this.host.enabled('axisScale')) {
      this.gesture = { kind: 'time-axis', pointerId, lastX: point.x };
      return;
    }

    if (region.kind === 'price-axis' && this.host.enabled('axisScale')) {
      this.gesture = {
        kind: 'price-axis',
        pointerId,
        paneId: region.paneId,
        anchorY: point.y,
        lastY: point.y
      };
      return;
    }

    const target = region.kind === 'plot' ? this.host.hitTest(point) : null;
    this.gesture = { kind: 'pressed', pointerId, touch, start: point, region, target };

    if (touch && !target) {
      this.longPressTimer = this.view.setTimeout(() => {
        this.longPressTimer = 0;

        if (this.gesture.kind === 'pressed' && this.gesture.pointerId === pointerId) {
          this.gesture = { kind: 'touch-crosshair', pointerId };
          this.host.setPointer(point);
        }
      }, this.host.longPressMs());
    }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const point = this.local(event);
    const gesture = this.gesture;

    if (event.pointerType === 'touch' && this.touches.has(event.pointerId)) {
      this.touches.set(event.pointerId, point);

      if (gesture.kind === 'pinch') {
        this.movePinch();
        return;
      }
    }

    switch (gesture.kind) {
      case 'idle':
        if (event.pointerType !== 'touch') {
          this.scheduleHover(point);
        }

        this.host.activeTool()?.pointerMove(point);
        return;
      case 'tool':
        if (event.pointerId === gesture.pointerId) {
          this.host.activeTool()?.pointerMove(point);
          this.host.setPointer(point);
        }

        return;
      case 'pressed':
        if (event.pointerId === gesture.pointerId) {
          this.movePressed(gesture, point);
        }

        return;
      case 'pan':
        if (event.pointerId === gesture.pointerId) {
          this.movePan(gesture, point, event.timeStamp);
        }

        return;
      case 'drag':
        if (event.pointerId === gesture.pointerId) {
          gesture.session.move(point);

          if (!gesture.touch) {
            this.host.setPointer(point);
          }
        }

        return;
      case 'time-axis':
        if (event.pointerId === gesture.pointerId) {
          this.host.zoomTime(
            Math.exp((point.x - gesture.lastX) * AXIS_DRAG_SPEED),
            this.host.plotWidth()
          );
          gesture.lastX = point.x;
        }

        return;
      case 'price-axis':
        if (event.pointerId === gesture.pointerId) {
          this.host.zoomPrice(
            gesture.paneId,
            Math.exp((gesture.lastY - point.y) * AXIS_DRAG_SPEED),
            gesture.anchorY
          );
          gesture.lastY = point.y;
        }

        return;
      case 'separator':
        if (event.pointerId === gesture.pointerId) {
          gesture.session.move(point.y - gesture.startY);
        }

        return;
      case 'touch-crosshair':
        if (event.pointerId === gesture.pointerId) {
          this.host.setPointer(point);
        }

        return;
      case 'pinch':
        return;
    }
  };

  private movePressed(gesture: Extract<Gesture, { kind: 'pressed' }>, point: Point): void {
    if (distance(point, gesture.start) < (gesture.touch ? TOUCH_SLOP : MOUSE_SLOP)) {
      return;
    }

    this.clearLongPress();
    const target = gesture.target;

    if (target?.draggable) {
      const session = this.host.beginDrag(target, gesture.start);

      if (session) {
        this.gesture = {
          kind: 'drag',
          pointerId: gesture.pointerId,
          touch: gesture.touch,
          session
        };
        session.move(point);
        this.updateCursor(target, null);
        return;
      }
    }

    if (gesture.region.kind !== 'plot' || !this.host.enabled('pan')) {
      this.gesture = IDLE;
      return;
    }

    const pan: Extract<Gesture, { kind: 'pan' }> = {
      kind: 'pan',
      pointerId: gesture.pointerId,
      touch: gesture.touch,
      paneId: gesture.region.paneId,
      last: gesture.start,
      samples: []
    };
    this.gesture = pan;
    this.root.style.cursor = 'grabbing';
    this.movePan(pan, point, performance.now());
  }

  private movePan(gesture: Extract<Gesture, { kind: 'pan' }>, point: Point, time: number): void {
    const deltaX = point.x - gesture.last.x;
    const deltaY = point.y - gesture.last.y;
    gesture.last = point;
    this.host.scrollTime(deltaX);

    if (gesture.paneId !== null && !this.host.isAutoScale(gesture.paneId)) {
      this.host.panPrice(gesture.paneId, deltaY);
    }

    gesture.samples.push({ x: point.x, time });

    while (
      gesture.samples.length > 2 &&
      time - (gesture.samples[0]?.time ?? time) > VELOCITY_WINDOW_MS
    ) {
      gesture.samples.shift();
    }

    if (!gesture.touch) {
      this.host.setPointer(point);
    }
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const point = this.local(event);
    this.touches.delete(event.pointerId);
    const gesture = this.gesture;

    if (gesture.kind === 'pinch') {
      this.endPinch();
      return;
    }

    if ('pointerId' in gesture && gesture.pointerId !== event.pointerId) {
      return;
    }

    this.clearLongPress();
    this.gesture = IDLE;

    switch (gesture.kind) {
      case 'pressed':
        this.host.click(point, gesture.target);
        break;
      case 'tool':
        this.host.activeTool()?.pointerUp(point);
        break;
      case 'pan':
        this.startKinetic(gesture, event.timeStamp);
        break;
      case 'drag':
        gesture.session.end();
        break;
      case 'separator':
        gesture.session.end();
        break;
      default:
        break;
    }

    if (event.pointerType === 'touch') {
      // The crosshair follows a finger only while it presses.
      this.host.setPointer(null);
    }

    this.updateCursor(null, event.pointerType === 'touch' ? null : point);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.touches.delete(event.pointerId);

    if ('pointerId' in this.gesture && this.gesture.pointerId === event.pointerId) {
      this.cancelGesture();
    } else if (this.gesture.kind === 'pinch') {
      this.endPinch();
    }
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' && this.gesture.kind === 'idle') {
      this.hoverPoint = null;
      this.view.cancelAnimationFrame(this.hoverFrame);
      this.hoverFrame = 0;
      this.host.hover(null);
      this.host.setPointer(null);
    }
  };

  private readonly onWindowBlur = (): void => {
    this.cancelGesture();
  };

  // ─── Hover ─────────────────────────────────────────────────────────────────

  private scheduleHover(point: Point): void {
    this.hoverPoint = point;

    if (this.hoverFrame === 0) {
      this.hoverFrame = this.view.requestAnimationFrame(() => {
        this.hoverFrame = 0;
        const hovered = this.hoverPoint;

        if (hovered && this.gesture.kind === 'idle') {
          this.host.setPointer(hovered);
          const region = this.host.regionAt(hovered);
          const target =
            region.kind === 'plot' && !this.host.activeTool() ? this.host.hitTest(hovered) : null;
          this.host.hover(target);
          this.updateCursor(target, hovered);
        }
      });
    }
  }

  private updateCursor(target: HitTarget | null, point: Point | null): void {
    if (target) {
      this.root.style.cursor = target.cursor;
      return;
    }

    if (!point) {
      this.root.style.cursor = '';
      return;
    }

    const region = this.host.regionAt(point);
    const axisScale = this.host.enabled('axisScale');
    this.root.style.cursor =
      region.kind === 'separator'
        ? 'row-resize'
        : region.kind === 'price-axis' && axisScale
          ? 'ns-resize'
          : region.kind === 'time-axis' && axisScale
            ? 'ew-resize'
            : region.kind === 'plot'
              ? 'crosshair'
              : '';
  }

  // ─── Touch pinch ───────────────────────────────────────────────────────────

  private pinchGeometry(): { distance: number; center: number } | null {
    const [first, second] = [...this.touches.values()];
    return first && second
      ? { distance: Math.abs(first.x - second.x), center: (first.x + second.x) / 2 }
      : null;
  }

  private startPinch(): void {
    this.cancelGesture();
    const geometry = this.pinchGeometry();

    if (geometry && this.host.enabled('pinchZoom')) {
      this.gesture = {
        kind: 'pinch',
        distance: Math.max(geometry.distance, 1),
        center: geometry.center
      };
    }
  }

  private movePinch(): void {
    const gesture = this.gesture;
    const geometry = this.pinchGeometry();

    if (gesture.kind !== 'pinch' || !geometry) {
      return;
    }

    const span = Math.max(geometry.distance, 1);
    this.host.scrollTime(geometry.center - gesture.center);
    this.host.zoomTime(span / gesture.distance, geometry.center);
    gesture.distance = span;
    gesture.center = geometry.center;
  }

  /** After a pinch, a remaining finger continues as a pan from where it is, without a jump. */
  private endPinch(): void {
    if (this.touches.size >= 2) {
      return;
    }

    const [remaining] = [...this.touches.entries()];
    this.gesture =
      remaining && this.host.enabled('pan')
        ? {
            kind: 'pan',
            pointerId: remaining[0],
            touch: true,
            paneId: null,
            last: remaining[1],
            samples: []
          }
        : IDLE;
  }

  private clearLongPress(): void {
    if (this.longPressTimer !== 0) {
      this.view.clearTimeout(this.longPressTimer);
      this.longPressTimer = 0;
    }
  }

  // ─── Kinetic scrolling ─────────────────────────────────────────────────────

  private startKinetic(gesture: Extract<Gesture, { kind: 'pan' }>, time: number): void {
    const first = gesture.samples[0];
    const last = gesture.samples[gesture.samples.length - 1];

    if (
      !this.host.enabled('kineticScroll') ||
      !first ||
      !last ||
      time - last.time > VELOCITY_WINDOW_MS
    ) {
      return;
    }

    const elapsed = last.time - first.time;
    const velocity = elapsed > 0 ? (last.x - first.x) / elapsed : 0;

    if (Math.abs(velocity) < KINETIC_MIN_SPEED) {
      return;
    }

    this.kinetic = { velocity, time: performance.now(), frame: 0 };
    const step = (now: number) => {
      const delta = Math.max(0, now - this.kinetic.time);
      this.kinetic.time = now;
      this.kinetic.velocity *= Math.exp(-delta / KINETIC_DECAY_MS);

      if (Math.abs(this.kinetic.velocity) < KINETIC_STOP_SPEED) {
        this.kinetic.frame = 0;
        return;
      }

      this.host.scrollTime(this.kinetic.velocity * delta);
      this.kinetic.frame = this.view.requestAnimationFrame(step);
    };
    this.kinetic.frame = this.view.requestAnimationFrame(step);
  }

  private stopKinetic(): void {
    if (this.kinetic.frame !== 0) {
      this.view.cancelAnimationFrame(this.kinetic.frame);
      this.kinetic.frame = 0;
    }
  }

  // ─── Wheel, double click, context menu, keyboard ───────────────────────────

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.host.enabled('wheelZoom')) {
      return;
    }

    event.preventDefault();
    this.stopKinetic();
    const pixels = wheelPixels(event, this.root.clientHeight);

    if (event.ctrlKey) {
      this.wheel.pinch += pixels.y;
    } else {
      this.wheel.x += pixels.x;
      this.wheel.y += event.shiftKey ? 0 : pixels.y;
      this.wheel.x += event.shiftKey ? pixels.y : 0;
    }

    this.wheel.point = this.local(event);

    if (this.wheel.frame === 0) {
      this.wheel.frame = this.view.requestAnimationFrame(() => {
        this.wheel.frame = 0;
        this.applyWheel();
      });
    }
  };

  private applyWheel(): void {
    const { x, y, pinch, point } = this.wheel;
    this.wheel.x = 0;
    this.wheel.y = 0;
    this.wheel.pinch = 0;
    const region = this.host.regionAt(point);

    if (region.kind === 'price-axis') {
      this.host.zoomPrice(region.paneId, Math.exp(-(y + pinch) * WHEEL_ZOOM_SPEED), point.y);
      return;
    }

    if (pinch !== 0) {
      this.host.zoomTime(Math.exp(-pinch * PINCH_WHEEL_SPEED), point.x);
    }

    // Horizontal swipes scroll; vertical wheel movement zooms around the pointer.
    if (Math.abs(x) > Math.abs(y)) {
      this.host.scrollTime(-x);
    } else if (y !== 0) {
      this.host.zoomTime(Math.exp(-y * WHEEL_ZOOM_SPEED), point.x);
    }

    this.host.setPointer(point);
  }

  private readonly onDoubleClick = (event: MouseEvent): void => {
    const point = this.local(event);
    const tool = this.host.activeTool();

    if (tool) {
      tool.doubleClick(point);
      return;
    }

    this.host.doubleClick(point, this.host.regionAt(point));
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    const point = this.local(event);
    const region = this.host.regionAt(point);
    const target = region.kind === 'plot' ? this.host.hitTest(point) : null;

    if (this.host.contextMenu(point, target, event)) {
      event.preventDefault();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.host.enabled('keyboard')) {
      return;
    }

    const command = event.metaKey || event.ctrlKey;
    const key = event.key;
    const width = this.host.plotWidth();
    let handled = true;

    if (key === 'Escape') {
      if (this.gesture.kind !== 'idle') {
        this.cancelGesture();
      } else {
        this.host.escape();
      }
    } else if (this.gesture.kind !== 'idle') {
      // Commands that edit or move the chart wait until the gesture in progress ends.
      handled = false;
    } else if (command && key.toLowerCase() === 'z') {
      if (event.shiftKey) {
        this.host.redo();
      } else {
        this.host.undo();
      }
    } else if (command && key.toLowerCase() === 'y') {
      this.host.redo();
    } else if (key === 'Delete' || key === 'Backspace') {
      this.host.deleteSelection();
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const step = (event.shiftKey ? width / 2 : width / 20) * (key === 'ArrowLeft' ? 1 : -1);
      this.host.scrollTime(step);
    } else if (key === 'ArrowUp' || key === '+' || key === '=') {
      this.host.zoomTime(KEY_ZOOM, this.host.plotWidth());
    } else if (key === 'ArrowDown' || key === '-') {
      this.host.zoomTime(1 / KEY_ZOOM, this.host.plotWidth());
    } else if (key === 'End') {
      this.host.scrollToRealTime();
    } else {
      handled = false;
    }

    if (handled) {
      event.preventDefault();
    }
  };
}
