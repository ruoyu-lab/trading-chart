import type { Point } from '../interaction/types';
import type { Rect } from '../layout/layout';
import type { LineStyle } from '../options/types';
import { applyStroke, font, snap } from '../canvas/canvas';
import { withAlpha } from '../canvas/color';
import { fail } from '../utils/errors';
import { LruCache } from '../utils/lru-cache';
import { checkArray, checkNumber, checkString } from '../utils/validate';
import { HitPriority } from '../objects/types';

/** A button inside an order or alert label. Clicking it emits `buttonClick`. */
export interface PriceLineButton {
  id: string;
  /** Short text such as `✕` or `TP`. */
  text?: string;
  /** SVG path data drawn in a 24 × 24 box, e.g. from an icon set. */
  icon?: string;
  /** Width in CSS pixels; defaults to fit the content. */
  width?: number;
}

const SVG_PATH = /^\s*[Mm][\d\s,.eE+\-MmLlHhVvCcSsQqTtAaZz]*$/;

export function validateButtons(
  buttons: readonly PriceLineButton[] | undefined,
  label: string
): PriceLineButton[] {
  if (buttons === undefined) {
    return [];
  }

  checkArray(label, buttons);

  const ids = new Set<string>();

  return buttons.map((button, index) => {
    const path = `${label}[${index}]`;
    checkString(`${path}.id`, button.id);

    if (ids.has(button.id)) {
      fail(`${label} contains the button id "${button.id}" twice.`);
    }

    ids.add(button.id);

    if (button.text === undefined && button.icon === undefined) {
      fail(`${path} needs a text or an icon.`);
    }

    if (button.text !== undefined && typeof button.text !== 'string') {
      fail(`${path}.text must be a string.`);
    }

    if (
      button.icon !== undefined &&
      (typeof button.icon !== 'string' || !SVG_PATH.test(button.icon))
    ) {
      fail(`${path}.icon must be SVG path data starting with a move command, e.g. "M6 6L18 18".`);
    }

    if (button.width !== undefined) {
      checkNumber(`${path}.width`, button.width, { min: 8, max: 200 });
    }

    return { ...button };
  });
}

export interface PriceLineView {
  readonly id: string;
  /** Plot-relative y of the line. */
  readonly y: number;
  readonly color: string;
  readonly text: string;
  readonly axisText: string;
  readonly buttons: readonly PriceLineButton[];
  readonly lineStyle: LineStyle;
  readonly emphasized: boolean;
}

export interface PriceLineLayout {
  readonly view: PriceLineView;
  /** Center of the label, moved apart from overlapping labels. */
  readonly labelY: number;
  readonly label: Rect;
  readonly textWidth: number;
  readonly buttons: ReadonlyArray<{ readonly button: PriceLineButton; readonly rect: Rect }>;
}

const LABEL_PADDING = 6;
const LABEL_MARGIN = 8;
const LABEL_GAP = 2;

/** Lays out the labels of price lines at the right of the plot, keeping them from overlapping. */
export function layoutPriceLines(
  views: readonly PriceLineView[],
  plotWidth: number,
  fontSize: number,
  measure: (text: string, size: number) => number
): PriceLineLayout[] {
  const height = fontSize + 8;
  const sorted = [...views]
    .filter((view) => Number.isFinite(view.y))
    .sort((left, right) => left.y - right.y);
  const layouts: PriceLineLayout[] = [];
  let previousBottom = Number.NEGATIVE_INFINITY;

  for (const view of sorted) {
    const textWidth = view.text ? measure(view.text, fontSize) + LABEL_PADDING * 2 : 0;
    const buttonWidths = view.buttons.map(
      (button) =>
        button.width ??
        (button.icon ? height : measure(button.text ?? '', fontSize) + LABEL_PADDING * 2)
    );
    const width = textWidth + buttonWidths.reduce((sum, value) => sum + value, 0);
    const labelY = Math.max(view.y, previousBottom + LABEL_GAP + height / 2);
    const left = plotWidth - LABEL_MARGIN - width;
    const top = labelY - height / 2;
    let x = left + textWidth;
    const buttons = view.buttons.map((button, index) => {
      const buttonWidth = buttonWidths[index] ?? height;
      const rect = { x, y: top, width: buttonWidth, height };
      x += buttonWidth;
      return { button, rect };
    });

    layouts.push({ view, labelY, label: { x: left, y: top, width, height }, textWidth, buttons });
    previousBottom = top + height;
  }

  return layouts;
}

function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export interface PriceLineHit {
  readonly id: string;
  readonly part: string;
  readonly priority: number;
  readonly distance: number;
}

/** Hit-tests buttons, then labels, then lines. `point` is plot-relative. */
export function hitPriceLines(
  layouts: readonly PriceLineLayout[],
  point: Point,
  tolerance: number
): PriceLineHit | null {
  for (const layout of layouts) {
    for (const { button, rect } of layout.buttons) {
      if (contains(rect, point)) {
        return {
          id: layout.view.id,
          part: `button:${button.id}`,
          priority: HitPriority.button,
          distance: 0
        };
      }
    }
  }

  for (const layout of layouts) {
    if (contains(layout.label, point)) {
      return { id: layout.view.id, part: 'label', priority: HitPriority.label, distance: 0 };
    }
  }

  let best: PriceLineHit | null = null;

  for (const layout of layouts) {
    const distance = Math.abs(point.y - layout.view.y);

    if (distance <= tolerance && (!best || distance < best.distance)) {
      best = { id: layout.view.id, part: 'line', priority: HitPriority.line, distance };
    }
  }

  return best;
}

/** Path2D objects of button icons, owned by one painter. */
export class IconCache {
  private readonly paths = new LruCache<string, Path2D>(64);

  get(data: string): Path2D {
    return this.paths.getOrCreate(data, () => new Path2D(data));
  }
}

/** Paints price lines in a pane: the line, its label with buttons, and its price-axis label. */
export function paintPriceLines(
  ctx: CanvasRenderingContext2D,
  layouts: readonly PriceLineLayout[],
  plot: Rect,
  axis: Rect,
  options: {
    fontSize: number;
    fontFamily: string;
    pixelRatio: number;
    textColor: string;
    showAxis: boolean;
  },
  icons: IconCache
): void {
  ctx.font = font(options.fontSize, options.fontFamily);
  ctx.textBaseline = 'middle';

  for (const layout of layouts) {
    const { view, label } = layout;
    const y = snap(plot.y + view.y, 1, options.pixelRatio);
    const lineWidth = view.emphasized ? 2 : 1;

    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.width, y);
    applyStroke(ctx, view.color, lineWidth, view.lineStyle);
    ctx.stroke();

    const top = plot.y + label.y;
    const left = plot.x + label.x;

    if (layout.labelY !== view.y) {
      ctx.beginPath();
      ctx.moveTo(left + label.width / 2, y);
      ctx.lineTo(left + label.width / 2, top);
      applyStroke(ctx, view.color, 1);
      ctx.stroke();
    }

    ctx.fillStyle = view.color;
    ctx.beginPath();
    ctx.roundRect(left, top, label.width, label.height, 3);
    ctx.fill();

    if (view.text) {
      ctx.fillStyle = options.textColor;
      ctx.textAlign = 'center';
      ctx.fillText(view.text, left + layout.textWidth / 2, top + label.height / 2 + 0.5);
    }

    for (const { button, rect } of layout.buttons) {
      const x = plot.x + rect.x;
      ctx.fillStyle = withAlpha('#000000', 0.18);
      ctx.fillRect(x, top, rect.width, rect.height);
      ctx.fillStyle = withAlpha(options.textColor, 0.35);
      ctx.fillRect(x, top + 3, 1, rect.height - 6);

      if (button.icon) {
        const size = rect.height - 8;
        ctx.save();
        ctx.translate(x + (rect.width - size) / 2, top + 4);
        ctx.scale(size / 24, size / 24);
        ctx.strokeStyle = options.textColor;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.stroke(icons.get(button.icon));
        ctx.restore();
      } else if (button.text) {
        ctx.fillStyle = options.textColor;
        ctx.textAlign = 'center';
        ctx.fillText(button.text, x + rect.width / 2, top + rect.height / 2 + 0.5);
      }
    }

    if (options.showAxis && view.y >= 0 && view.y <= plot.height) {
      const height = options.fontSize + 8;
      ctx.fillStyle = view.color;
      ctx.beginPath();
      ctx.roundRect(axis.x + 1, plot.y + view.y - height / 2, axis.width - 2, height, 2);
      ctx.fill();
      ctx.fillStyle = options.textColor;
      ctx.textAlign = 'left';
      ctx.fillText(view.axisText, axis.x + 8, plot.y + view.y + 0.5);
    }
  }
}
