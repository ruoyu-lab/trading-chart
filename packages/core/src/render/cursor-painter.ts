import type { ChartOptions } from '../options/types';
import { applyStroke, drawLabel, font, snap } from '../canvas/canvas';
import type { Frame } from './frame';

export interface CrosshairView {
  /** Absolute x of the vertical line. */
  readonly x: number;
  /** Absolute y of the horizontal line, or `null` outside the plots. */
  readonly y: number | null;
  readonly timeText: string | null;
  readonly priceText: string | null;
}

export interface LegendSegment {
  readonly text: string;
  readonly color: string;
}

export interface LegendRow {
  readonly paneId: string;
  readonly segments: readonly LegendSegment[];
}

export interface CursorView {
  readonly crosshair: CrosshairView | null;
  readonly legends: readonly LegendRow[];
  readonly countdown: string | null;
}

const LABEL_PADDING_X = 6;
const LEGEND_GAP = 8;

function paintLatestLabel(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  countdown: string | null
): void {
  const latest = frame.latest;

  if (!latest || !options.latestPrice.label || !options.priceScale.visible) {
    return;
  }

  const { axis } = frame.main;
  const height = options.font.size + 8;
  const y = axis.y + latest.y;

  if (!Number.isFinite(y) || latest.y < 0 || latest.y > axis.height) {
    return;
  }

  const background = latest.up ? options.theme.up : options.theme.down;
  ctx.font = font(options.font.size, options.font.family);
  ctx.fillStyle = background;
  const lines = countdown ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(axis.x + 1, y - height / 2, axis.width - 2, height * lines - (lines - 1) * 6, 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(latest.text, axis.x + LABEL_PADDING_X + 2, y + 0.5);

  if (countdown) {
    ctx.fillText(countdown, axis.x + LABEL_PADDING_X + 2, y + height - 5.5);
  }
}

function paintCrosshair(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  pixelRatio: number,
  crosshair: CrosshairView
): void {
  const { theme } = options;
  const config = options.crosshair;
  const plotBottom = frame.layout.timeAxis?.y ?? frame.layout.height;
  ctx.beginPath();

  if (config.vertical) {
    const x = snap(crosshair.x, 1, pixelRatio);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, plotBottom);
  }

  if (config.horizontal && crosshair.y !== null) {
    const y = snap(crosshair.y, 1, pixelRatio);
    ctx.moveTo(0, y);
    ctx.lineTo(frame.layout.plotWidth, y);
  }

  applyStroke(ctx, theme.crosshair, 1, config.style);
  ctx.stroke();

  if (!config.labels) {
    return;
  }

  ctx.font = font(options.font.size, options.font.family);
  const height = options.font.size + 8;
  const label = {
    background: theme.crosshairLabelBackground,
    color: theme.crosshairLabelText,
    paddingX: LABEL_PADDING_X,
    height
  };

  if (crosshair.priceText !== null && crosshair.y !== null && options.priceScale.visible) {
    drawLabel(ctx, crosshair.priceText, frame.layout.plotWidth + 1, crosshair.y, {
      ...label,
      align: 'left'
    });
  }

  const axis = frame.layout.timeAxis;

  if (crosshair.timeText !== null && axis) {
    const width = ctx.measureText(crosshair.timeText).width + LABEL_PADDING_X * 2;
    const center = Math.min(
      Math.max(crosshair.x, width / 2),
      Math.max(width / 2, frame.layout.plotWidth - width / 2)
    );
    drawLabel(ctx, crosshair.timeText, center, axis.y + axis.height / 2, {
      ...label,
      align: 'center'
    });
  }
}

function paintLegends(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  legends: readonly LegendRow[]
): void {
  ctx.font = font(options.font.size, options.font.family);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lineHeight = options.font.size + 6;
  const rowsByPane = new Map<string, number>();

  for (const row of legends) {
    const pane = frame.panes.find((candidate) => candidate.id === row.paneId);

    if (!pane) {
      continue;
    }

    const rowIndex = rowsByPane.get(row.paneId) ?? 0;
    rowsByPane.set(row.paneId, rowIndex + 1);
    const y = pane.plot.y + 6 + rowIndex * lineHeight;

    if (y + lineHeight > pane.plot.y + pane.plot.height) {
      continue;
    }

    let x = pane.plot.x + 8;

    for (const segment of row.segments) {
      ctx.fillStyle = segment.color;
      ctx.fillText(segment.text, x, y);
      x += ctx.measureText(segment.text).width + LEGEND_GAP;
    }
  }
}

/** Paints legends, the latest-price label and the crosshair. */
export function paintCursor(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  options: ChartOptions,
  pixelRatio: number,
  view: CursorView
): void {
  if (options.legend.visible) {
    paintLegends(ctx, frame, options, view.legends);
  }

  paintLatestLabel(ctx, frame, options, view.countdown);

  if (view.crosshair) {
    paintCrosshair(ctx, frame, options, pixelRatio, view.crosshair);
  }
}
