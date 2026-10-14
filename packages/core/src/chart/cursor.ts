import type { BarStore } from '../data/bar-store';
import type { Bar } from '../data/types';
import type { Formatter } from '../format/formatter';
import { formatValue } from '../format/value-format';
import type { IndicatorStore } from '../indicators/indicator-store';
import type { ChartOptions } from '../options/types';
import { MAIN_PANE_ID } from '../panes/pane-store';
import type { CursorView, LegendRow, LegendSegment } from '../render/cursor-painter';
import {
  formatPaneValue,
  indicatorColors,
  indicatorFormat,
  type Frame,
  type PaneFrame
} from '../render/frame';
import type { TimeScale } from '../scales/time-scale';
import type { SeriesStore } from '../series/series-store';

/** Where the crosshair points. */
export interface CrosshairState {
  /** CSS pixel position inside the chart. */
  readonly x: number;
  readonly y: number;
  /** Pane under the pointer, or `null` over the time axis. */
  readonly paneId: string | null;
  /** Logical bar index under the pointer; may lie beyond the data. */
  readonly index: number;
  readonly time: number | null;
  /** Value at `y` in the pane's scale, or `null` outside the panes. */
  readonly price: number | null;
  /** The hovered bar, or `null` outside the data. */
  readonly bar: Bar | null;
}

export interface CursorSources {
  readonly options: ChartOptions;
  readonly formatter: Formatter;
  readonly bars: BarStore;
  readonly timeScale: TimeScale;
  readonly indicators: IndicatorStore;
  readonly series: SeriesStore;
}

function paneAt(frame: Frame, y: number): PaneFrame | null {
  return frame.panes.find((pane) => y >= pane.plot.y && y < pane.plot.y + pane.plot.height) ?? null;
}

/** Resolves the crosshair for a pointer position, applying the magnet mode. */
export function crosshairAt(
  sources: CursorSources,
  frame: Frame,
  x: number,
  y: number
): CrosshairState | null {
  const { bars, timeScale, options } = sources;

  if (bars.length === 0 || x < 0 || x > frame.layout.plotWidth) {
    return null;
  }

  const index = Math.round(timeScale.xToIndex(x));
  const time = bars.timeOfLogicalIndex(index);
  const bar = bars.bar(index);
  const pane = paneAt(frame, y);
  let price: number | null = null;
  let snappedY = y;

  if (pane) {
    price = pane.scale.yToValue(y - pane.plot.y);

    if (options.crosshair.mode === 'magnet' && pane.id === MAIN_PANE_ID && bar) {
      price = bar.close;
      snappedY = pane.plot.y + pane.scale.valueToY(price);
    }
  }

  return {
    x: timeScale.indexToX(index),
    y: snappedY,
    paneId: pane?.id ?? null,
    index,
    time: Number.isNaN(time) ? null : time,
    price: price !== null && Number.isFinite(price) ? price : null,
    bar
  };
}

function mainLegend(sources: CursorSources, frame: Frame, index: number): LegendSegment[] {
  const { bars, options, formatter } = sources;
  const bar = bars.bar(index);

  if (!bar) {
    return [];
  }

  const { theme } = options;
  const previousClose = index > 0 ? bars.close(index - 1) : bar.open;
  const change = bar.close - previousClose;
  const color = change >= 0 ? theme.up : theme.down;
  const price = (value: number) => formatValue(formatter, value, frame.priceFormat);
  const percent = previousClose === 0 ? 0 : (change / previousClose) * 100;
  const sign = change >= 0 ? '+' : '';

  return [
    { text: `O ${price(bar.open)}`, color },
    { text: `H ${price(bar.high)}`, color },
    { text: `L ${price(bar.low)}`, color },
    { text: `C ${price(bar.close)}`, color },
    { text: `${sign}${price(change)} (${sign}${formatter.number(percent, 2)}%)`, color },
    { text: `V ${formatter.compact(bar.volume)}`, color: theme.textMuted }
  ];
}

function paramText(params: Record<string, number | readonly number[]>): string {
  return Object.values(params)
    .flatMap((value) => (typeof value === 'number' ? [value] : [...value]))
    .join(' ');
}

/** Legend rows: the main bar's OHLC, then one row per indicator and series. */
function buildLegends(sources: CursorSources, frame: Frame, index: number): LegendRow[] {
  const { options, indicators, series, formatter } = sources;
  const { theme } = options;
  const rows: LegendRow[] = [{ paneId: MAIN_PANE_ID, segments: mainLegend(sources, frame, index) }];

  for (const entry of indicators.list()) {
    if (!entry.visible) {
      continue;
    }

    entry.series.sync();
    const colors = indicatorColors(entry, theme.palette);
    const format = indicatorFormat(entry, frame.priceFormat);
    const name = entry.definition.name;
    const params = paramText(entry.params);
    const segments: LegendSegment[] = [
      { text: params ? `${name} ${params}` : name, color: theme.textMuted }
    ];

    entry.outputs.forEach((output, column) => {
      const value = entry.series.value(column, index);
      const color =
        colors.get(output.key) ??
        (output.plot.kind === 'histogram' && value < 0 ? theme.down : theme.up);
      segments.push({ text: `${output.label} ${formatValue(formatter, value, format)}`, color });
    });

    rows.push({ paneId: entry.pane, segments });
  }

  for (const entry of series.list()) {
    if (entry.visible) {
      rows.push({ paneId: entry.pane, segments: [{ text: entry.title, color: theme.textMuted }] });
    }
  }

  return rows;
}

export function buildCursorView(
  sources: CursorSources,
  frame: Frame,
  crosshair: CrosshairState | null,
  now: number
): CursorView {
  const { bars, formatter, options } = sources;
  const index = crosshair?.bar && crosshair.index < bars.length ? crosshair.index : bars.length - 1;
  const legends =
    options.legend.visible && bars.length > 0 ? buildLegends(sources, frame, index) : [];
  let countdown: string | null = null;
  const interval = bars.interval();

  if (options.latestPrice.countdown && interval !== null && bars.length > 0) {
    countdown = formatter.duration(bars.time(bars.length - 1) + interval - now);
  }

  if (!crosshair) {
    return { crosshair: null, legends, countdown };
  }

  const pane = crosshair.paneId
    ? frame.panes.find((item) => item.id === crosshair.paneId)
    : undefined;
  const timeText =
    crosshair.time === null
      ? null
      : options.timeScale.formatter
        ? options.timeScale.formatter(crosshair.time, {
            kind: 'crosshair',
            unit: 'minute',
            locale: formatter.locale,
            timeZone: formatter.timeZone
          })
        : formatter.timeCrosshair(crosshair.time, interval);

  return {
    crosshair: {
      x: crosshair.x,
      y: pane ? crosshair.y : null,
      timeText,
      priceText:
        pane && crosshair.price !== null ? formatPaneValue(sources, pane, crosshair.price) : null
    },
    legends,
    countdown
  };
}
