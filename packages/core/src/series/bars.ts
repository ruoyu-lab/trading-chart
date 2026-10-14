import { alignToDevice, snap } from '../canvas/canvas';
import type { CandleStyle, HighLowStyle, OhlcStyle } from './styles';
import type { SeriesPaintContext, SeriesTypeDefinition } from './types';

const DIRECTIONS = [true, false] as const;

function paintCandles(context: SeriesPaintContext<CandleStyle>, hollow: boolean): void {
  const { ctx, points, style, pixelRatio, barSpacing } = context;
  const width = Math.max(1 / pixelRatio, alignToDevice(barSpacing * style.bodyRatio, pixelRatio));
  const thin = width * pixelRatio < 3;
  const hairline = 1 / pixelRatio;
  ctx.setLineDash([]);

  for (const up of DIRECTIONS) {
    const bodyColor = up ? style.upColor : style.downColor;
    const filled = !(hollow && up);

    if (style.wick || thin) {
      ctx.beginPath();

      for (let index = 0; index < points.count; index += 1) {
        if (points.up(index) === up) {
          const x = snap(points.x(index), 1, pixelRatio);
          ctx.moveTo(x, points.high(index));
          ctx.lineTo(x, points.low(index));
        }
      }

      ctx.strokeStyle = thin ? bodyColor : up ? style.upWickColor : style.downWickColor;
      ctx.lineWidth = hairline;
      ctx.stroke();
    }

    if (thin) {
      continue;
    }

    ctx.beginPath();

    for (let index = 0; index < points.count; index += 1) {
      if (points.up(index) !== up) {
        continue;
      }

      const open = points.open(index);
      const close = points.close(index);
      ctx.rect(
        alignToDevice(points.x(index) - width / 2, pixelRatio),
        alignToDevice(Math.min(open, close), pixelRatio),
        width,
        Math.max(hairline, alignToDevice(Math.abs(close - open), pixelRatio))
      );
    }

    if (filled) {
      ctx.fillStyle = bodyColor;
      ctx.fill();
    }

    if (style.border || !filled) {
      // Clipping to the bodies keeps the border inside them, so it never widens a candle.
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = filled ? (up ? style.upBorderColor : style.downBorderColor) : bodyColor;
      ctx.lineWidth = 2 * Math.max(hairline, alignToDevice(1, pixelRatio));
      ctx.stroke();
      ctx.restore();
    }
  }
}

function candleStyle(up: string, down: string): CandleStyle {
  return {
    upColor: up,
    downColor: down,
    upWickColor: up,
    downWickColor: down,
    upBorderColor: up,
    downBorderColor: down,
    wick: true,
    border: false,
    bodyRatio: 0.72
  };
}

export const candlesSeries: SeriesTypeDefinition<CandleStyle> = {
  input: 'ohlc',
  defaultStyle: (theme) => candleStyle(theme.up, theme.down),
  paint: (context) => {
    paintCandles(context, false);
  }
};

export const hollowCandlesSeries: SeriesTypeDefinition<CandleStyle> = {
  input: 'ohlc',
  defaultStyle: (theme) => candleStyle(theme.up, theme.down),
  paint: (context) => {
    paintCandles(context, true);
  }
};

export const ohlcSeries: SeriesTypeDefinition<OhlcStyle> = {
  input: 'ohlc',
  defaultStyle: (theme) => ({
    upColor: theme.up,
    downColor: theme.down,
    lineWidth: 1,
    ticks: true
  }),
  paint: ({ ctx, points, style, pixelRatio, barSpacing }) => {
    const tick = Math.max(1, Math.min(barSpacing * 0.4, 8));
    const ticks = style.ticks && barSpacing >= 3;
    ctx.lineWidth = style.lineWidth;
    ctx.setLineDash([]);

    for (const up of DIRECTIONS) {
      ctx.beginPath();

      for (let index = 0; index < points.count; index += 1) {
        if (points.up(index) !== up) {
          continue;
        }

        const x = snap(points.x(index), style.lineWidth, pixelRatio);
        ctx.moveTo(x, points.high(index));
        ctx.lineTo(x, points.low(index));

        if (ticks) {
          const open = snap(points.open(index), style.lineWidth, pixelRatio);
          const close = snap(points.close(index), style.lineWidth, pixelRatio);
          ctx.moveTo(x - tick, open);
          ctx.lineTo(x, open);
          ctx.moveTo(x, close);
          ctx.lineTo(x + tick, close);
        }
      }

      ctx.strokeStyle = up ? style.upColor : style.downColor;
      ctx.stroke();
    }
  }
};

export const highLowSeries: SeriesTypeDefinition<HighLowStyle> = {
  input: 'ohlc',
  defaultStyle: (theme) => ({ upColor: theme.up, downColor: theme.down, lineWidth: 2 }),
  paint: ({ ctx, points, style, pixelRatio }) => {
    ctx.lineWidth = style.lineWidth;
    ctx.lineCap = 'butt';
    ctx.setLineDash([]);

    for (const up of DIRECTIONS) {
      ctx.beginPath();

      for (let index = 0; index < points.count; index += 1) {
        if (points.up(index) === up) {
          const x = snap(points.x(index), style.lineWidth, pixelRatio);
          ctx.moveTo(x, points.high(index));
          ctx.lineTo(x, points.low(index));
        }
      }

      ctx.strokeStyle = up ? style.upColor : style.downColor;
      ctx.stroke();
    }
  }
};
