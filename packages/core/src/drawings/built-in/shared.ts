import type { Point } from '../../interaction/types';
import { applyStroke, drawLabel, font } from '../../canvas/canvas';
import { distanceToSegment, insidePolygon, type Segment } from '../geometry';
import type { DrawingHit, DrawingPaintContext, DrawingStyle } from '../types';

export const bodyHit: DrawingHit = { part: 'body', distance: 0 };

/**
 * Strokes the path built by `trace` with the drawing's line style, thicker while hovered.
 * `stroke` overrides the color or the dash pattern.
 */
export function strokeDrawing(
  context: DrawingPaintContext,
  trace: (ctx: CanvasRenderingContext2D) => void,
  stroke: Partial<Pick<DrawingStyle, 'color' | 'lineStyle'>> = {}
): void {
  const { ctx, geometry, hovered } = context;
  ctx.beginPath();
  trace(ctx);
  applyStroke(
    ctx,
    stroke.color ?? geometry.style.color,
    geometry.style.lineWidth + (hovered ? 1 : 0),
    stroke.lineStyle ?? geometry.style.lineStyle
  );
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Adds a polyline through `points` to the current path, closed into a polygon when `closed`. */
export function tracePath(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  closed: boolean
): void {
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });

  if (closed) {
    ctx.closePath();
  }
}

export function fillArea(
  ctx: CanvasRenderingContext2D,
  polygon: readonly Point[],
  color: string
): void {
  ctx.beginPath();
  tracePath(ctx, polygon, true);
  ctx.fillStyle = color;
  ctx.fill();
}

export function segmentHit(
  point: Point,
  start: Point,
  end: Point,
  tolerance: number
): DrawingHit | null {
  const distance = distanceToSegment(point, start, end);
  return distance <= tolerance ? { part: 'line', distance } : null;
}

/** A `line` hit on the nearest of `segments` within `tolerance`. */
export function segmentsHit(
  point: Point,
  segments: readonly Segment[],
  tolerance: number
): DrawingHit | null {
  const distance = segments.reduce(
    (nearest, [start, end]) => Math.min(nearest, distanceToSegment(point, start, end)),
    Number.POSITIVE_INFINITY
  );
  return distance <= tolerance ? { part: 'line', distance } : null;
}

/** A `line` hit on one of `lines`, else a `body` hit inside the `area` polygon. */
export function shapeHit(
  point: Point,
  lines: readonly Segment[],
  area: readonly Point[],
  tolerance: number
): DrawingHit | null {
  return segmentsHit(point, lines, tolerance) ?? (insidePolygon(point, area) ? bodyHit : null);
}

/** A value label pinned to the right edge of the plot. */
export function edgeLabel(context: DrawingPaintContext, text: string, y: number): void {
  const { ctx, geometry } = context;
  ctx.font = font(geometry.style.fontSize, geometry.fontFamily);
  drawLabel(ctx, text, geometry.width - 2, y, {
    background: geometry.style.color,
    color: geometry.theme.background,
    paddingX: 4,
    height: geometry.style.fontSize + 6,
    align: 'right'
  });
}
