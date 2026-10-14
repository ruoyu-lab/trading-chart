import type { Point } from '../../interaction/types';
import { applyStroke, drawLabel, font } from '../../canvas/canvas';
import { withAlpha } from '../../canvas/color';
import { insideRect, segmentsOf, type Segment } from '../geometry';
import type { DrawingGeometry, DrawingHit, DrawingTypeDefinition } from '../types';
import { bodyHit, fillArea, segmentsHit, shapeHit, strokeDrawing, tracePath } from './shared';

const TEXT_PADDING = 4;
const TEXT_PLACEHOLDER = 'Text';
const RANGE_LABEL_GAP = 6;

/** Corners of the axis-aligned box spanned by two opposite corners, in drawing order. */
function corners(first: Point, second: Point): Point[] {
  return [first, { x: second.x, y: first.y }, second, { x: first.x, y: second.y }];
}

/** Hits the border of the box spanned by the two anchors as `line` and its inside as `body`. */
function boxHit(geometry: DrawingGeometry, point: Point, tolerance: number): DrawingHit | null {
  const [first, second] = geometry.points;

  if (!first || !second) {
    return null;
  }

  const box = corners(first, second);
  return shapeHit(point, segmentsOf(box, true), box, tolerance);
}

export const rectangle: DrawingTypeDefinition = {
  points: 2,
  defaultStyle: (theme) => ({ fillColor: withAlpha(theme.accent, 0.12) }),
  paint: (context) => {
    const [first, second] = context.geometry.points;

    if (!first || !second) {
      return;
    }

    const box = corners(first, second);
    fillArea(context.ctx, box, context.geometry.style.fillColor);
    strokeDrawing(context, (ctx) => {
      tracePath(ctx, box, true);
    });
  },
  hitTest: boxHit
};

interface Channel {
  /** The base line and its parallel. */
  readonly lines: readonly Segment[];
  readonly middle: Segment;
  readonly area: readonly Point[];
}

/** The shift moving the base line through `through`: vertical, or horizontal for a vertical base. */
function channelOffset(start: Point, end: Point, through: Point): Point {
  if (start.x === end.x) {
    return { x: through.x - start.x, y: 0 };
  }

  const baseY = start.y + ((through.x - start.x) / (end.x - start.x)) * (end.y - start.y);
  return { x: 0, y: through.y - baseY };
}

function channelOf(geometry: DrawingGeometry): Channel | null {
  const [start, end, through] = geometry.points;

  if (!start || !end || !through) {
    return null;
  }

  const offset = channelOffset(start, end, through);
  const shift = (point: Point, factor: number): Point => ({
    x: point.x + offset.x * factor,
    y: point.y + offset.y * factor
  });
  const parallel: Segment = [shift(start, 1), shift(end, 1)];
  return {
    lines: [[start, end], parallel],
    middle: [shift(start, 0.5), shift(end, 0.5)],
    area: [start, end, parallel[1], parallel[0]]
  };
}

export const parallelChannel: DrawingTypeDefinition = {
  points: 3,
  defaultStyle: (theme) => ({ fillColor: withAlpha(theme.accent, 0.12) }),
  paint: (context) => {
    const channel = channelOf(context.geometry);

    if (!channel) {
      return;
    }

    fillArea(context.ctx, channel.area, context.geometry.style.fillColor);
    strokeDrawing(context, (ctx) => {
      channel.lines.forEach((line) => {
        tracePath(ctx, line, false);
      });
    });
    strokeDrawing(
      context,
      (ctx) => {
        tracePath(ctx, channel.middle, false);
      },
      { lineStyle: 'dashed' }
    );
  },
  hitTest: (geometry, point, tolerance) => {
    const channel = channelOf(geometry);
    return channel ? shapeHit(point, channel.lines, channel.area, tolerance) : null;
  }
};

/** The change from `from` to `to`, with the percent change relative to `from` unless it is 0. */
function rangeText(geometry: DrawingGeometry, from: number, to: number): string {
  const change = to - from;
  const sign = change > 0 ? '+' : '';
  const value = `${sign}${geometry.formatValue(change)}`;
  return from === 0 ? value : `${value} (${sign}${((change / Math.abs(from)) * 100).toFixed(2)}%)`;
}

export const priceRange: DrawingTypeDefinition = {
  points: 2,
  paint: (context) => {
    const { geometry } = context;
    const [start, end] = geometry.points;
    const [from, to] = geometry.anchors;

    if (!start || !end || !from || !to) {
      return;
    }

    const color = to.price >= from.price ? geometry.theme.up : geometry.theme.down;
    const box = corners(start, end);
    fillArea(context.ctx, box, withAlpha(color, 0.15));
    strokeDrawing(
      context,
      (ctx) => {
        tracePath(ctx, box, true);
      },
      { color }
    );

    // The label sits beyond the second anchor, kept inside the plot.
    const height = geometry.style.fontSize + 8;
    const y =
      end.y <= start.y
        ? Math.min(start.y, end.y) - RANGE_LABEL_GAP - height / 2
        : Math.max(start.y, end.y) + RANGE_LABEL_GAP + height / 2;
    context.ctx.font = font(geometry.style.fontSize, geometry.fontFamily);
    drawLabel(
      context.ctx,
      rangeText(geometry, from.price, to.price),
      (start.x + end.x) / 2,
      Math.min(Math.max(y, height / 2), geometry.height - height / 2),
      {
        background: color,
        color: geometry.theme.background,
        paddingX: 6,
        height,
        align: 'center'
      }
    );
  },
  hitTest: boxHit
};

function textOf(geometry: DrawingGeometry): string {
  return geometry.text === '' ? TEXT_PLACEHOLDER : geometry.text;
}

/** Top-left and bottom-right corners of the padded box around `width` pixels of text at `anchor`. */
function textBox(geometry: DrawingGeometry, anchor: Point, width: number): [Point, Point] {
  const half = geometry.style.fontSize / 2 + TEXT_PADDING;
  return [
    { x: anchor.x - TEXT_PADDING, y: anchor.y - half },
    { x: anchor.x + width + TEXT_PADDING, y: anchor.y + half }
  ];
}

export const text: DrawingTypeDefinition = {
  points: 1,
  paint: ({ ctx, geometry, hovered, selected }) => {
    const [anchor] = geometry.points;

    if (!anchor) {
      return;
    }

    const content = textOf(geometry);
    ctx.font = font(geometry.style.fontSize, geometry.fontFamily);

    if (hovered || selected) {
      const [topLeft, bottomRight] = textBox(geometry, anchor, geometry.measureText(content));
      applyStroke(ctx, withAlpha(geometry.style.color, 0.6), 1);
      ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    }

    ctx.fillStyle = geometry.style.textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(content, anchor.x, anchor.y);
  },
  hitTest: (geometry, point, tolerance) => {
    const [anchor] = geometry.points;

    if (!anchor) {
      return null;
    }

    const [topLeft, bottomRight] = textBox(
      geometry,
      anchor,
      geometry.measureText(textOf(geometry))
    );
    return insideRect(point, topLeft, bottomRight, tolerance) ? bodyHit : null;
  }
};

/** An open-ended polyline through every anchor. */
export const path: DrawingTypeDefinition = {
  points: 0,
  paint: (context) => {
    strokeDrawing(context, (ctx) => {
      tracePath(ctx, context.geometry.points, false);
    });
  },
  hitTest: (geometry, point, tolerance) =>
    segmentsHit(point, segmentsOf(geometry.points, false), tolerance)
};
