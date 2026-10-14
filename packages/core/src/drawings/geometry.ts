import type { Point } from '../interaction/types';

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/**
 * Extends the segment from `start` through `end` to the borders of a `width` × `height` box:
 * `ray` extends past `end` only, `line` extends both ways, `segment` keeps it as is.
 */
export function extendSegment(
  start: Point,
  end: Point,
  width: number,
  height: number,
  mode: 'segment' | 'ray' | 'line'
): [Point, Point] {
  if (mode === 'segment' || (start.x === end.x && start.y === end.y)) {
    return [start, end];
  }

  const reach = 2 * (width + height);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const ux = (end.x - start.x) / length;
  const uy = (end.y - start.y) / length;
  const far = { x: start.x + ux * reach, y: start.y + uy * reach };
  const back = mode === 'line' ? { x: start.x - ux * reach, y: start.y - uy * reach } : start;
  return [back, far];
}

export function insideRect(point: Point, first: Point, second: Point, padding = 0): boolean {
  return (
    point.x >= Math.min(first.x, second.x) - padding &&
    point.x <= Math.max(first.x, second.x) + padding &&
    point.y >= Math.min(first.y, second.y) - padding &&
    point.y <= Math.max(first.y, second.y) + padding
  );
}

export function insidePolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;

  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const a = polygon[index];
    const b = polygon[previous];

    if (
      a &&
      b &&
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

export type Segment = readonly [Point, Point];

/** Segments joining consecutive points, plus the last point to the first when `closed`. */
export function segmentsOf(points: readonly Point[], closed: boolean): Segment[] {
  const segments: Segment[] = [];
  let previous = closed ? points.at(-1) : undefined;

  for (const point of points) {
    if (previous) {
      segments.push([previous, point]);
    }

    previous = point;
  }

  return segments;
}
