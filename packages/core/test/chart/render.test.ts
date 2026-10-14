import { describe, expect, it, vi } from 'vitest';
import type { Chart } from '../../src/chart/create-chart';
import type { SeriesType } from '../../src/series/styles';
import type { SeriesPaintContext } from '../../src/series/types';
import { createBars, MINUTE, T0 } from '../helpers/bars';
import { chartWithBars, click, drag, nextFrame, pointer } from '../helpers/chart';
import { canvasCalls } from '../setup';

/** Message of bars whose OHLC fields are missing. */
const NOT_A_BAR = /finite number/;

const SERIES_TYPES: SeriesType[] = [
  'candles',
  'hollow-candles',
  'ohlc',
  'high-low',
  'line',
  'step-line',
  'line-markers',
  'area',
  'baseline',
  'hlc-area',
  'columns'
];

function layer(chart: Chart, name: 'scene' | 'objects' | 'cursor'): HTMLCanvasElement {
  const canvas = chart.element.querySelector<HTMLCanvasElement>(`canvas[data-layer="${name}"]`);

  if (!canvas) {
    throw new Error(`Missing ${name} layer.`);
  }

  return canvas;
}

function paint(chart: Chart, name: 'scene' | 'objects' | 'cursor'): string[] {
  const calls = canvasCalls(layer(chart, name));
  calls.length = 0;
  chart.applyOptions({});
  chart.screenshot();
  return calls.map((call) => call.name);
}

describe('rendering', () => {
  it.each(SERIES_TYPES)('paints the main series as %s', (type) => {
    const chart = chartWithBars(120);
    chart.applyOptions({ mainSeries: { type } });
    const calls = paint(chart, 'scene');

    expect(calls).toContain('stroke');
    expect(calls.some((name) => name === 'fill' || name === 'stroke')).toBe(true);
    expect(calls).toContain('fillText');
  });

  it('paints indicators, levels and fills', () => {
    const chart = chartWithBars(120);
    chart.indicators.add({ type: 'BOLL' });
    chart.indicators.add({ type: 'RSI' });
    chart.indicators.add({ type: 'MACD' });
    const calls = paint(chart, 'scene');

    expect(calls.filter((name) => name === 'stroke').length).toBeGreaterThan(10);
    expect(calls).toContain('setLineDash');
  });

  it('paints drawings, orders, alerts and markers on the objects layer', () => {
    const chart = chartWithBars(120);
    const bars = createBars(120);
    chart.drawings.add({
      type: 'fib-retracement',
      points: [
        { time: T0, price: bars[0]!.low },
        { time: T0 + 100 * MINUTE, price: bars[100]!.high }
      ]
    });
    chart.orders.set([
      { id: 'o', side: 'buy', price: bars[110]!.close, buttons: [{ id: 'x', icon: 'M6 6L18 18' }] }
    ]);
    chart.alerts.set([{ id: 'a', trigger: 'cross', value: bars[105]!.close, label: 'A' }]);
    chart.markers.set([
      { id: 'm', time: T0 + 110 * MINUTE, position: 'above', shape: 'arrow-down', text: 'S' }
    ]);
    const calls = paint(chart, 'objects');

    expect(calls.filter((name) => name === 'fillText').length).toBeGreaterThan(8);
    expect(calls).toContain('roundRect');
  });

  it('paints the crosshair, legends and countdown on the cursor layer', async () => {
    const chart = chartWithBars(120, { latestPrice: { countdown: true } });
    pointer(chart, 'pointermove', 300, 200, { buttons: 0 });
    await nextFrame();
    const calls = paint(chart, 'cursor');

    expect(calls.filter((name) => name === 'fillText').length).toBeGreaterThan(6);
  });
});

describe('series', () => {
  it('adds a comparison series in its own pane and removes the pane with it', () => {
    const chart = chartWithBars(120);
    const id = chart.series.add({
      type: 'line',
      pane: 'new',
      title: 'BTC',
      data: createBars(120).map((bar) => ({ time: bar.time, value: bar.close * 2 }))
    });

    expect(chart.panes.list()).toHaveLength(2);
    expect(chart.series.get(id)).toMatchObject({ type: 'line', title: 'BTC' });
    expect(paint(chart, 'scene')).toContain('stroke');

    chart.series.updateData(id, { time: T0 + 120 * MINUTE, value: 1 });
    expect(() => {
      chart.series.updateData(id, { time: T0, value: 1 });
    }).toThrow('older than the last point');

    chart.series.remove(id);
    expect(chart.panes.list()).toHaveLength(1);
  });

  it('rejects value points for OHLC series and unknown types', () => {
    const chart = chartWithBars(10);

    expect(() => chart.series.add({ type: 'candles', data: [{ time: T0, value: 1 }] })).toThrow(
      NOT_A_BAR
    );
    expect(() => chart.series.add({ type: 'renko' })).toThrow('Unknown series type "renko"');
  });

  it('accepts custom series types', () => {
    const chart = chartWithBars(30);
    const paintSpy = vi.fn(
      (context: SeriesPaintContext<{ color: string }>) => context.points.count
    );
    chart.series.registerType('dots', {
      input: 'value',
      defaultStyle: (_theme, color) => ({ color }),
      paint: paintSpy
    });
    chart.series.add({
      type: 'dots',
      data: createBars(30).map((bar) => ({ time: bar.time, value: bar.close }))
    });
    chart.screenshot();

    expect(paintSpy).toHaveBeenCalled();
    expect(paintSpy.mock.results[0]?.value).toBeGreaterThan(0);
  });
});

describe('pointer behavior', () => {
  it('reports clicks on markers', () => {
    const chart = chartWithBars(120);
    chart.markers.set([
      { id: 'm', time: T0 + 110 * MINUTE, position: 'price', price: 160, shape: 'circle' }
    ]);
    const clicks = vi.fn();
    chart.on('click', clicks);
    const x = chart.timeScale.timeToX(T0 + 110 * MINUTE) ?? 0;
    const y = chart.priceScale().priceToY(160) ?? 0;
    click(chart, x, y);

    expect(clicks.mock.calls[0]?.[0]).toMatchObject({ target: { kind: 'marker', id: 'm' } });
    expect(chart.selection()).toEqual({ kind: 'marker', id: 'm' });
  });

  it('drags an alert level and keeps it', () => {
    const chart = chartWithBars(120, { priceScale: { precision: 2 } });
    chart.alerts.set([{ id: 'a', trigger: 'cross', value: 160 }]);
    const drags = vi.fn();
    chart.on('alertDrag', drags);
    const y = chart.priceScale().priceToY(160) ?? 0;
    drag(chart, [200, y], [200, y + 40]);

    expect(chart.alerts.get('a')?.value).toBeLessThan(160);
    expect(drags.mock.calls.at(-1)?.[0]).toMatchObject({ id: 'a', phase: 'end' });
  });

  it('shows a resize cursor over axes and a pointer over objects', async () => {
    const chart = chartWithBars(120);
    chart.orders.set([{ id: 'o', side: 'buy', price: 160 }]);
    const y = chart.priceScale().priceToY(160) ?? 0;
    pointer(chart, 'pointermove', 200, y, { buttons: 0 });
    await nextFrame();
    expect(chart.element.style.cursor).toBe('ns-resize');

    pointer(chart, 'pointermove', chart.layout().plotWidth + 10, 100, { buttons: 0 });
    await nextFrame();
    expect(chart.element.style.cursor).toBe('ns-resize');

    pointer(chart, 'pointermove', 200, 20, { buttons: 0 });
    await nextFrame();
    expect(chart.element.style.cursor).toBe('crosshair');
  });

  it('zooms with the wheel and scrolls horizontally with a trackpad', async () => {
    const chart = chartWithBars(400);
    const spacing = chart.timeScale.getBarSpacing();
    chart.element.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -200, clientX: 300, clientY: 200, cancelable: true })
    );
    await nextFrame();
    expect(chart.timeScale.getBarSpacing()).toBeGreaterThan(spacing);

    const from = chart.timeScale.getVisibleLogicalRange()?.from ?? 0;
    chart.element.dispatchEvent(
      new WheelEvent('wheel', { deltaX: -300, clientX: 300, clientY: 200, cancelable: true })
    );
    await nextFrame();
    expect(chart.timeScale.getVisibleLogicalRange()?.from).toBeLessThan(from);
  });
});
