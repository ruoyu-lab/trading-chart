import { font } from '../../canvas/canvas';
import { withAlpha } from '../../canvas/color';
import type { Segment } from '../geometry';
import type { DrawingGeometry, DrawingTypeDefinition } from '../types';
import { segmentsHit, strokeDrawing, tracePath } from './shared';

const FIB_LEVELS: readonly number[] = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

interface FibLevel {
  readonly level: number;
  readonly price: number;
  readonly y: number;
}

interface Retracement {
  readonly diagonal: Segment;
  readonly left: number;
  readonly right: number;
  readonly levels: readonly FibLevel[];
}

/** Levels measured in value from the first anchor (level 0) to the second (level 1). */
function retracementOf(geometry: DrawingGeometry): Retracement | null {
  const [start, end] = geometry.points;
  const [from, to] = geometry.anchors;

  if (!start || !end || !from || !to) {
    return null;
  }

  return {
    diagonal: [start, end],
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    levels: FIB_LEVELS.map((level) => {
      const price = from.price + (to.price - from.price) * level;
      return { level, price, y: geometry.valueToY(price) };
    })
  };
}

function levelLines({ left, right, levels }: Retracement): Segment[] {
  return levels.map(({ y }): Segment => [
    { x: left, y },
    { x: right, y }
  ]);
}

export const fibRetracement: DrawingTypeDefinition = {
  points: 2,
  defaultStyle: (theme) => ({ fillColor: withAlpha(theme.accent, 0.08) }),
  paint: (context) => {
    const { ctx, geometry } = context;
    const retracement = retracementOf(geometry);

    if (!retracement) {
      return;
    }

    const { left, right, levels } = retracement;

    // Every other band is filled so neighbouring bands stay distinguishable.
    ctx.fillStyle = geometry.style.fillColor;
    levels.forEach(({ y }, index) => {
      const next = levels[index + 1];

      if (next && index % 2 === 0) {
        ctx.fillRect(left, y, right - left, next.y - y);
      }
    });

    strokeDrawing(context, () => {
      levelLines(retracement).forEach((line) => {
        tracePath(ctx, line, false);
      });
    });
    strokeDrawing(
      context,
      () => {
        tracePath(ctx, retracement.diagonal, false);
      },
      { lineStyle: 'dashed' }
    );

    ctx.font = font(geometry.style.fontSize, geometry.fontFamily);
    ctx.fillStyle = geometry.style.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    levels.forEach(({ level, price, y }) => {
      ctx.fillText(`${level} (${geometry.formatValue(price)})`, left + 4, y - 2);
    });
  },
  hitTest: (geometry, point, tolerance) => {
    const retracement = retracementOf(geometry);
    return retracement ? segmentsHit(point, levelLines(retracement), tolerance) : null;
  }
};
