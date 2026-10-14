import type { ChartOptions } from '../options/types';
import { applyStroke, font, snap } from '../canvas/canvas';
import type { Frame, PaneFrame, PlotJob } from './frame';
import { tracePolyline } from '../series/lines';

const AXIS_LABEL_PADDING = 8;

function paintJob(
  ctx: CanvasRenderingContext2D,
  job: PlotJob,
  pane: PaneFrame,
  pixelRatio: number,
  barSpacing: number
): void {
  switch (job.kind) {
    case 'series':
      ctx.save();
      job.definition.paint({
        ctx,
        pixelRatio,
        width: pane.plot.width,
        height: pane.plot.height,
        barSpacing,
        style: job.style,
        points: job.points,
        valueToY: (value) => pane.scale.valueToY(value)
      });
      ctx.restore();
      return;
    case 'fill': {
      ctx.beginPath();
      tracePolyline(ctx, job.from, (index) => job.from.value(index));

      for (let index = job.to.count - 1; index >= 0; index -= 1) {
        const y = job.to.value(index);

        if (!Number.isNaN(y)) {
          ctx.lineTo(job.to.x(index), y);
        }
      }

      ctx.closePath();
      ctx.fillStyle = job.color;
      ctx.fill();
      return;
    }
    case 'level': {
      const y = snap(job.y, 1, pixelRatio);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(pane.plot.width, y);
      applyStroke(ctx, job.color, 1, 'dashed');
      ctx.stroke();
      return;
    }
  }
}

function paintGrid(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  pixelRatio: number
): void {
  const { grid, theme } = options;

  if (!grid.vertical && !grid.horizontal) {
    return;
  }

  ctx.beginPath();

  for (const pane of frame.panes) {
    const { plot } = pane;

    if (grid.vertical) {
      for (const tick of frame.timeTicks) {
        const x = snap(tick.x, 1, pixelRatio);
        ctx.moveTo(x, plot.y);
        ctx.lineTo(x, plot.y + plot.height);
      }
    }

    if (grid.horizontal) {
      for (const tick of pane.ticks) {
        const y = snap(plot.y + tick.y, 1, pixelRatio);
        ctx.moveTo(plot.x, y);
        ctx.lineTo(plot.x + plot.width, y);
      }
    }
  }

  applyStroke(ctx, theme.grid, 1, grid.style);
  ctx.stroke();
}

function paintPriceAxes(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  pixelRatio: number
): void {
  if (!options.priceScale.visible) {
    return;
  }

  const { theme } = options;
  ctx.font = font(options.font.size, options.font.family);
  ctx.fillStyle = theme.textMuted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const half = options.font.size / 2;

  for (const pane of frame.panes) {
    const { axis } = pane;

    for (const tick of pane.ticks) {
      const y = axis.y + tick.y;

      if (tick.y >= half && tick.y <= axis.height - half) {
        ctx.fillText(tick.text, axis.x + AXIS_LABEL_PADDING, y);
      }
    }
  }

  const x = snap(frame.layout.plotWidth, 1, pixelRatio);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, frame.layout.height);
  applyStroke(ctx, theme.border, 1);
  ctx.stroke();
}

function paintTimeAxis(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  pixelRatio: number
): void {
  const axis = frame.layout.timeAxis;

  if (!axis) {
    return;
  }

  const { theme } = options;
  const y = snap(axis.y, 1, pixelRatio);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(axis.width, y);
  applyStroke(ctx, theme.border, 1);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, axis.y, frame.layout.plotWidth, axis.height);
  ctx.clip();
  ctx.font = font(options.font.size, options.font.family);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const tick of frame.timeTicks) {
    const strong = tick.unit === 'year' || tick.unit === 'month' || tick.unit === 'day';
    ctx.fillStyle = strong ? theme.text : theme.textMuted;
    ctx.fillText(tick.text, tick.x, axis.y + axis.height / 2);
  }

  ctx.restore();
}

function paintSeparators(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  pixelRatio: number
): void {
  if (frame.layout.separators.length === 0) {
    return;
  }

  ctx.beginPath();

  for (const separator of frame.layout.separators) {
    const y = snap(separator.y + separator.height / 2, 1, pixelRatio);
    ctx.moveTo(0, y);
    ctx.lineTo(frame.layout.width, y);
  }

  applyStroke(ctx, options.theme.border, 1);
  ctx.stroke();
}

function paintLatestPriceLine(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  pixelRatio: number
): void {
  const latest = frame.latest;

  if (!latest || !options.latestPrice.line || !Number.isFinite(latest.y)) {
    return;
  }

  const { plot } = frame.main;

  if (latest.y < 0 || latest.y > plot.height) {
    return;
  }

  const y = snap(plot.y + latest.y, 1, pixelRatio);
  ctx.beginPath();
  ctx.moveTo(plot.x, y);
  ctx.lineTo(plot.x + plot.width, y);
  applyStroke(ctx, latest.up ? options.theme.up : options.theme.down, 1, options.latestPrice.style);
  ctx.stroke();
}

/** Paints background, grid, series, indicators and axes. */
export function paintScene(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  pixelRatio: number,
  barSpacing: number
): void {
  ctx.fillStyle = options.theme.background;
  ctx.fillRect(0, 0, frame.layout.width, frame.layout.height);
  paintGrid(ctx, frame, options, pixelRatio);

  for (const pane of frame.panes) {
    const { plot } = pane;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.width, plot.height);
    ctx.clip();
    ctx.translate(plot.x, plot.y);

    for (const job of pane.jobs) {
      paintJob(ctx, job, pane, pixelRatio, barSpacing);
    }

    ctx.restore();
  }

  paintLatestPriceLine(ctx, frame, options, pixelRatio);
  paintSeparators(ctx, frame, options, pixelRatio);
  paintPriceAxes(ctx, frame, options, pixelRatio);
  paintTimeAxis(ctx, frame, options, pixelRatio);
}
