import { toTime, type TimeInput } from '../data/time';
import type { DragSession, Point } from '../interaction/types';
import { MAIN_PANE_ID } from '../panes/pane-store';
import { font } from '../canvas/canvas';
import {
  HitPriority,
  paneOf,
  type ObjectContext,
  type ObjectDomain,
  type ObjectHit,
  type ObjectPaintContext
} from '../objects/types';
import { fail } from '../utils/errors';
import { checkNumber, checkObject, checkOneOf, checkString } from '../utils/validate';

export type MarkerShape =
  'arrow-up' | 'arrow-down' | 'triangle-up' | 'triangle-down' | 'circle' | 'square';
export type MarkerPosition = 'above' | 'below' | 'price';

export interface MarkerInput {
  id: string;
  time: TimeInput;
  /** Above the bar's high, below its low, or at `price`. */
  position: MarkerPosition;
  /** Required with position `price`. */
  price?: number;
  shape: MarkerShape;
  /** Defaults to the theme's buy color for upward shapes and sell color otherwise. */
  color?: string;
  text?: string;
  /** Marker size in CSS pixels. Default 8. */
  size?: number;
}

export interface Marker {
  readonly id: string;
  readonly time: number;
  readonly position: MarkerPosition;
  readonly price: number | null;
  readonly shape: MarkerShape;
  readonly color: string | null;
  readonly text: string;
  readonly size: number;
}

const SHAPES = [
  'arrow-up',
  'arrow-down',
  'triangle-up',
  'triangle-down',
  'circle',
  'square'
] as const;
const POSITIONS = ['above', 'below', 'price'] as const;
const GAP = 4;

export function parseMarker(input: MarkerInput, label = 'marker'): Marker {
  checkObject(label, input);

  checkString(`${label}.id`, input.id);
  const position = checkOneOf(`${label}.position`, input.position, POSITIONS);

  if (position === 'price' && input.price === undefined) {
    fail(`${label}.price is required with position "price".`);
  }

  if (input.text !== undefined && typeof input.text !== 'string') {
    fail(`${label}.text must be a string.`);
  }

  return {
    id: input.id,
    time: toTime(input.time, `${label}.time`),
    position,
    price: input.price === undefined ? null : checkNumber(`${label}.price`, input.price),
    shape: checkOneOf(`${label}.shape`, input.shape, SHAPES),
    color: input.color === undefined ? null : checkString(`${label}.color`, input.color),
    text: input.text ?? '',
    size:
      input.size === undefined ? 8 : checkNumber(`${label}.size`, input.size, { min: 2, max: 40 })
  };
}

function markerInput(marker: Marker): MarkerInput {
  return {
    id: marker.id,
    time: marker.time,
    position: marker.position,
    shape: marker.shape,
    text: marker.text,
    size: marker.size,
    ...(marker.price !== null ? { price: marker.price } : {}),
    ...(marker.color !== null ? { color: marker.color } : {})
  };
}

interface PlacedMarker {
  readonly marker: Marker;
  /** Center of the shape, plot-relative. */
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

/** Trade executions and signals pinned to bars of the main pane. */
export class MarkersDomain implements ObjectDomain {
  readonly kind = 'marker';
  private markers = new Map<string, Marker>();

  has(id: string): boolean {
    return this.markers.has(id);
  }

  list(): Marker[] {
    return [...this.markers.values()];
  }

  get(id: string): Marker | undefined {
    return this.markers.get(id);
  }

  set(inputs: readonly MarkerInput[]): void {
    const next = new Map<string, Marker>();

    inputs.forEach((input, index) => {
      const marker = parseMarker(input, `markers[${index}]`);

      if (next.has(marker.id)) {
        fail(`markers contains the id "${marker.id}" twice.`);
      }

      next.set(marker.id, marker);
    });

    this.markers = next;
  }

  add(input: MarkerInput): void {
    const marker = parseMarker(input);

    if (this.markers.has(marker.id)) {
      fail(`A marker with id "${marker.id}" already exists.`);
    }

    this.markers.set(marker.id, marker);
  }

  update(id: string, patch: Partial<Omit<MarkerInput, 'id'>>): void {
    const current = this.markers.get(id) ?? fail(`Unknown marker "${id}".`);
    this.markers.set(id, parseMarker({ ...markerInput(current), ...patch, id }));
  }

  remove(id: string): void {
    if (!this.markers.delete(id)) {
      fail(`Unknown marker "${id}".`);
    }
  }

  /** Positions of the visible markers; markers on the same bar stack away from it. */
  private place(context: ObjectContext): PlacedMarker[] {
    const pane = paneOf(context.frame, MAIN_PANE_ID);
    const visible = context.frame.visible;

    if (!pane || !visible || this.markers.size === 0) {
      return [];
    }

    const { bars, timeScale, options } = context;
    const stacks = new Map<string, number>();
    const placed: PlacedMarker[] = [];

    for (const marker of this.markers.values()) {
      const index = bars.indexAt(marker.time);

      if (index < visible.from - 1 || index > visible.to + 1 || index < 0) {
        continue;
      }

      // Markers belong to the bar their time falls in, so they sit on its center.
      const x = timeScale.indexToX(index);
      const key = `${index}:${marker.position}`;
      const offset = stacks.get(key) ?? 0;
      stacks.set(key, offset + marker.size * 2 + GAP);
      let y: number;

      if (marker.position === 'above') {
        y = pane.scale.valueToY(bars.high(index)) - GAP - marker.size - offset;
      } else if (marker.position === 'below') {
        y = pane.scale.valueToY(bars.low(index)) + GAP + marker.size + offset;
      } else {
        y = pane.scale.valueToY(marker.price ?? Number.NaN);
      }

      const upward = marker.shape === 'arrow-up' || marker.shape === 'triangle-up';
      placed.push({
        marker,
        x,
        y,
        color: marker.color ?? (upward ? options.theme.buy : options.theme.sell)
      });
    }

    return placed;
  }

  hitTest(context: ObjectContext, point: Point): ObjectHit | null {
    const pane = paneOf(context.frame, MAIN_PANE_ID);

    if (!pane) {
      return null;
    }

    const local = { x: point.x - pane.plot.x, y: point.y - pane.plot.y };
    let best: ObjectHit | null = null;

    for (const placed of this.place(context)) {
      const distance = Math.hypot(local.x - placed.x, local.y - placed.y);

      if (distance <= placed.marker.size + 3 && (best === null || distance < best.distance)) {
        best = {
          target: {
            kind: 'marker',
            id: placed.marker.id,
            part: 'body',
            cursor: 'pointer',
            draggable: false
          },
          priority: HitPriority.body,
          distance
        };
      }
    }

    return best;
  }

  beginDrag(): DragSession | null {
    return null;
  }

  paint(context: ObjectPaintContext): void {
    const pane = paneOf(context.frame, MAIN_PANE_ID);

    if (!pane) {
      return;
    }

    const { ctx, options } = context;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.plot.x, pane.plot.y, pane.plot.width, pane.plot.height);
    ctx.clip();
    ctx.translate(pane.plot.x, pane.plot.y);
    ctx.font = font(options.font.size - 1, options.font.family);
    ctx.textAlign = 'center';

    for (const { marker, x, y, color } of this.place(context)) {
      const selected =
        (context.selection?.kind === 'marker' && context.selection.id === marker.id) ||
        (context.hovered?.kind === 'marker' && context.hovered.id === marker.id);
      const size = marker.size * (selected ? 1.25 : 1);
      ctx.fillStyle = color;
      ctx.beginPath();
      traceShape(ctx, marker.shape, x, y, size);
      ctx.fill();

      if (marker.text) {
        const below = marker.position === 'below';
        ctx.textBaseline = below ? 'top' : 'bottom';
        ctx.fillText(marker.text, x, below ? y + size + 2 : y - size - 2);
      }
    }

    ctx.restore();
  }
}

function traceShape(
  ctx: CanvasRenderingContext2D,
  shape: MarkerShape,
  x: number,
  y: number,
  size: number
): void {
  switch (shape) {
    case 'circle':
      ctx.arc(x, y, size, 0, Math.PI * 2);
      return;
    case 'square':
      ctx.rect(x - size, y - size, size * 2, size * 2);
      return;
    case 'triangle-up':
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.lineTo(x - size, y + size);
      ctx.closePath();
      return;
    case 'triangle-down':
      ctx.moveTo(x, y + size);
      ctx.lineTo(x + size, y - size);
      ctx.lineTo(x - size, y - size);
      ctx.closePath();
      return;
    case 'arrow-up':
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x + size * 0.4, y);
      ctx.lineTo(x + size * 0.4, y + size);
      ctx.lineTo(x - size * 0.4, y + size);
      ctx.lineTo(x - size * 0.4, y);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      return;
    case 'arrow-down':
      ctx.moveTo(x, y + size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x + size * 0.4, y);
      ctx.lineTo(x + size * 0.4, y - size);
      ctx.lineTo(x - size * 0.4, y - size);
      ctx.lineTo(x - size * 0.4, y);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      return;
  }
}
