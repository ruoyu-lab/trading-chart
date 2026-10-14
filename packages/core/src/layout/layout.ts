export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaneLayout {
  id: string;
  /** The drawing area. Its `x` is always 0. */
  plot: Rect;
  /** The price axis to the right of the plot. */
  axis: Rect;
}

export interface SeparatorLayout {
  above: string;
  below: string;
  y: number;
  height: number;
}

export interface Layout {
  width: number;
  height: number;
  plotWidth: number;
  axisWidth: number;
  panes: PaneLayout[];
  separators: SeparatorLayout[];
  timeAxis: Rect | null;
}

export interface LayoutPaneInput {
  id: string;
  /** Requested height in pixels. Ignored for the stretching pane. */
  height: number;
  /** The main pane absorbs the space left by the other panes. */
  stretch: boolean;
}

export interface LayoutInput {
  width: number;
  height: number;
  axisWidth: number;
  timeAxisHeight: number;
  separatorHeight: number;
  minPaneHeight: number;
  panes: readonly LayoutPaneInput[];
}

/**
 * Resolves pane heights. Fixed panes keep their requested heights and the stretching pane takes
 * the rest; when space runs out, fixed panes shrink proportionally while every pane keeps
 * `minHeight` where possible.
 */
function resolvePaneHeights(
  available: number,
  panes: readonly LayoutPaneInput[],
  minHeight: number
): number[] {
  if (panes.length === 0) {
    return [];
  }

  const floor = Math.min(minHeight, available / panes.length);
  const fixedTotal = panes.reduce((sum, pane) => (pane.stretch ? sum : sum + pane.height), 0);
  const stretchCount = panes.filter((pane) => pane.stretch).length;
  const reservedForStretch = stretchCount * floor;
  const fixedBudget = Math.max(0, available - reservedForStretch);
  const scale = fixedTotal > fixedBudget && fixedTotal > 0 ? fixedBudget / fixedTotal : 1;
  const heights = panes.map((pane) => (pane.stretch ? 0 : Math.max(floor, pane.height * scale)));
  const used = heights.reduce((sum, height) => sum + height, 0);
  const rest = Math.max(0, available - used);

  if (stretchCount === 0) {
    const lastIndex = heights.length - 1;
    heights[lastIndex] = (heights[lastIndex] ?? 0) + rest;
    return heights;
  }

  return panes.map((pane, index) => (pane.stretch ? rest / stretchCount : (heights[index] ?? 0)));
}

export function computeLayout(input: LayoutInput): Layout {
  const width = Math.max(0, input.width);
  const height = Math.max(0, input.height);
  const axisWidth = Math.min(input.axisWidth, width);
  const plotWidth = Math.max(0, width - axisWidth);
  const timeAxisHeight = Math.min(input.timeAxisHeight, height);
  const separators = Math.max(0, input.panes.length - 1) * input.separatorHeight;
  const available = Math.max(0, height - timeAxisHeight - separators);
  const heights = resolvePaneHeights(available, input.panes, input.minPaneHeight);
  const panes: PaneLayout[] = [];
  const separatorLayouts: SeparatorLayout[] = [];
  let y = 0;

  input.panes.forEach((pane, index) => {
    const paneHeight = heights[index] ?? 0;
    panes.push({
      id: pane.id,
      plot: { x: 0, y, width: plotWidth, height: paneHeight },
      axis: { x: plotWidth, y, width: axisWidth, height: paneHeight }
    });
    y += paneHeight;

    const next = input.panes[index + 1];

    if (next) {
      separatorLayouts.push({ above: pane.id, below: next.id, y, height: input.separatorHeight });
      y += input.separatorHeight;
    }
  });

  return {
    width,
    height,
    plotWidth,
    axisWidth,
    panes,
    separators: separatorLayouts,
    timeAxis: timeAxisHeight > 0 ? { x: 0, y, width, height: timeAxisHeight } : null
  };
}
