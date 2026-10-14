import { extendSegment } from '../geometry';
import type { DrawingGeometry, DrawingTypeDefinition } from '../types';
import { edgeLabel, segmentHit, strokeDrawing } from './shared';

function lineType(mode: 'segment' | 'ray' | 'line'): DrawingTypeDefinition {
  const ends = (geometry: DrawingGeometry) => {
    const [start, end] = geometry.points;
    return start && end ? extendSegment(start, end, geometry.width, geometry.height, mode) : null;
  };

  return {
    points: 2,
    paint: (context) => {
      const line = ends(context.geometry);

      if (line) {
        strokeDrawing(context, (ctx) => {
          ctx.moveTo(line[0].x, line[0].y);
          ctx.lineTo(line[1].x, line[1].y);
        });
      }
    },
    hitTest: (geometry, point, tolerance) => {
      const line = ends(geometry);
      return line ? segmentHit(point, line[0], line[1], tolerance) : null;
    }
  };
}

export const trendLine = lineType('segment');
export const ray = lineType('ray');
export const extendedLine = lineType('line');

export const arrow: DrawingTypeDefinition = {
  points: 2,
  paint: (context) => {
    const [start, end] = context.geometry.points;

    if (!start || !end) {
      return;
    }

    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const head = 8 + context.geometry.style.lineWidth * 2;
    strokeDrawing(context, (ctx) => {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.moveTo(
        end.x - head * Math.cos(angle - Math.PI / 7),
        end.y - head * Math.sin(angle - Math.PI / 7)
      );
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(
        end.x - head * Math.cos(angle + Math.PI / 7),
        end.y - head * Math.sin(angle + Math.PI / 7)
      );
    });
  },
  hitTest: (geometry, point, tolerance) => {
    const [start, end] = geometry.points;
    return start && end ? segmentHit(point, start, end, tolerance) : null;
  }
};

function horizontalType(fromAnchor: boolean): DrawingTypeDefinition {
  return {
    points: 1,
    paint: (context) => {
      const { geometry } = context;
      const [anchor] = geometry.points;
      const value = geometry.anchors[0]?.price;

      if (!anchor || value === undefined) {
        return;
      }

      strokeDrawing(context, (ctx) => {
        ctx.moveTo(fromAnchor ? anchor.x : 0, anchor.y);
        ctx.lineTo(geometry.width, anchor.y);
      });
      edgeLabel(context, geometry.formatValue(value), anchor.y);
    },
    hitTest: (geometry, point, tolerance) => {
      const [anchor] = geometry.points;
      return anchor
        ? segmentHit(
            point,
            { x: fromAnchor ? anchor.x : 0, y: anchor.y },
            { x: geometry.width, y: anchor.y },
            tolerance
          )
        : null;
    }
  };
}

export const horizontalLine = horizontalType(false);
export const horizontalRay = horizontalType(true);

export const verticalLine: DrawingTypeDefinition = {
  points: 1,
  paint: (context) => {
    const [anchor] = context.geometry.points;

    if (anchor) {
      strokeDrawing(context, (ctx) => {
        ctx.moveTo(anchor.x, 0);
        ctx.lineTo(anchor.x, context.geometry.height);
      });
    }
  },
  hitTest: (geometry, point, tolerance) => {
    const [anchor] = geometry.points;
    return anchor
      ? segmentHit(point, { x: anchor.x, y: 0 }, { x: anchor.x, y: geometry.height }, tolerance)
      : null;
  }
};
