import { describe, expect, it, vi } from 'vitest';
import { createChart } from '../../src/chart/create-chart';
import type { BarInput } from '../../src/data/types';
import { darkTheme, lightTheme } from '../../src/options/themes';
import { ChartError } from '../../src/utils/errors';
import { createBars, MINUTE, T0 } from '../helpers/bars';
import { chartWithBars, createTestChart, pointer } from '../helpers/chart';
import { canvasCalls, resizeObservers } from '../setup';

describe('createChart', () => {
  it('builds its own element with three canvases and removes it on destroy', () => {
    const chart = createTestChart();
    const container = chart.element.parentElement;

    expect(chart.element.querySelectorAll('canvas')).toHaveLength(3);
    expect(resizeObservers.size).toBe(1);

    chart.destroy();

    expect(container?.children).toHaveLength(0);
    expect(resizeObservers.size).toBe(0);
    expect(() => {
      chart.data.set([]);
    }).toThrow('destroyed');
  });

  it('sizes the canvases to whole device pixels and repaints them right after a resize', () => {
    const ratio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

    try {
      const chart = chartWithBars(100);
      const scene = chart.element.querySelector('canvas') as HTMLCanvasElement;
      const calls = canvasCalls(scene);
      calls.length = 0;
      resizeObservers.forEach((observer) => {
        observer.report(800.5, 661.5);
      });

      expect([scene.width, scene.height]).toEqual([1601, 1323]);
      expect([scene.style.width, scene.style.height]).toEqual(['800.5px', '661.5px']);
      expect(chart.layout().height).toBe(661.5);
      expect(calls.length).toBeGreaterThan(0);
    } finally {
      if (ratio) {
        Object.defineProperty(window, 'devicePixelRatio', ratio);
      }
    }
  });

  it('rejects a missing container and invalid options', () => {
    expect(() => createChart(null as unknown as HTMLElement)).toThrow(ChartError);
    expect(() => createTestChart({ timeScale: { barSpacing: -1 } })).toThrow(
      'options.timeScale.barSpacing'
    );
  });

  it('applies options atomically', () => {
    const chart = createTestChart();
    const before = chart.options();

    expect(() => {
      chart.applyOptions({ theme: lightTheme, crosshair: { mode: 'sticky' as 'free' } });
    }).toThrow();
    expect(chart.options()).toBe(before);

    chart.applyOptions({ theme: lightTheme });
    expect(chart.options().theme.background).toBe(lightTheme.background);
  });

  it('freezes resolved options and themes but leaves arrays passed in untouched', () => {
    const palette = ['#111111', '#222222'];
    const chart = createTestChart({ theme: { palette } });

    expect(Object.isFrozen(chart.options().theme.palette)).toBe(true);
    expect(Object.isFrozen(darkTheme)).toBe(true);
    expect(Object.isFrozen(palette)).toBe(false);
    expect(chart.options().theme.palette).toEqual(palette);
  });

  it('cancels a gesture in progress on destroy without notifying anyone', () => {
    const chart = chartWithBars(200);
    chart.orders.set([{ id: 'o1', side: 'buy', price: 180 }]);
    const drags = vi.fn();
    chart.on('orderDrag', drags);
    const x = chart.timeScale.timeToX(T0 + 120 * MINUTE) ?? 0;
    const y = chart.priceScale().priceToY(180) ?? 0;
    pointer(chart, 'pointerdown', x, y);
    pointer(chart, 'pointermove', x, y - 40);
    drags.mockClear();

    expect(() => {
      chart.destroy();
    }).not.toThrow();
    expect(drags).not.toHaveBeenCalled();
  });
});

describe('data', () => {
  it('follows new bars while the latest bar is visible', () => {
    const chart = chartWithBars(200);
    const before = chart.timeScale.getVisibleRange();
    chart.data.update(createBars(201).slice(200));
    const after = chart.timeScale.getVisibleRange();

    expect(after?.to).toBe(T0 + 200 * MINUTE);
    expect(after?.from).toBe((before?.from ?? 0) + MINUTE);
  });

  it('keeps the view on history while the latest bar is scrolled out', () => {
    const chart = chartWithBars(400);
    chart.timeScale.scrollToIndex(100, 'center');
    const before = chart.timeScale.getVisibleRange();
    chart.data.update(createBars(405).slice(400));

    expect(chart.timeScale.getVisibleRange()).toEqual(before);
  });

  it('keeps the view when history is prepended', () => {
    const all = createBars(300);
    const chart = createTestChart();
    chart.data.set(all.slice(100));
    const before = chart.timeScale.getVisibleRange();

    expect(chart.data.prepend(all.slice(0, 110))).toBe(100);
    expect(chart.timeScale.getVisibleRange()).toEqual(before);
    expect(chart.data.length).toBe(300);
  });

  it('keeps following new bars while the container is hidden', () => {
    const chart = createTestChart(undefined, 0, 500);
    chart.data.set(createBars(200));
    chart.data.update(createBars(205).slice(200));
    resizeObservers.forEach((observer) => {
      observer.report(800, 500);
    });

    expect(chart.timeScale.isFollowing()).toBe(true);
    expect(chart.timeScale.getVisibleRange()?.to).toBe(T0 + 204 * MINUTE);
  });

  it('copies inputs and validates them', () => {
    const chart = createTestChart();
    const bars = createBars(3);
    chart.data.set(bars);
    bars[0]!.close = 999;

    expect(chart.data.at(0)?.close).not.toBe(999);
    expect(() => {
      chart.data.update(createBars(2)[0]!);
    }).toThrow('older than the last bar');
    expect(() => {
      chart.data.set([null as unknown as BarInput]);
    }).toThrow('bars[0] must be an object, received null');
  });
});

describe('loadMore', () => {
  it('fires once near the oldest bar, not on every tick, and again after more history arrives', () => {
    const all = createBars(600);
    const chart = createTestChart({ timeScale: { loadMoreThreshold: 10 } });
    const requests: number[] = [];
    chart.on('loadMore', ({ before }) => requests.push(before));
    chart.data.set(all.slice(300));
    chart.timeScale.scrollToIndex(0, 'left');
    chart.timeScale.getVisibleRange();

    expect(requests).toEqual([all[300]!.time]);

    for (let tick = 0; tick < 5; tick += 1) {
      chart.data.update({ ...all[599]!, close: all[599]!.close + tick * 0.01 });
      chart.timeScale.getVisibleRange();
    }

    expect(requests).toHaveLength(1);

    chart.data.prepend(all.slice(0, 300));
    chart.timeScale.scrollToIndex(0, 'left');
    chart.timeScale.getVisibleRange();

    expect(requests).toEqual([all[300]!.time, all[0]!.time]);
  });
});

describe('time scale', () => {
  it('converts between times and coordinates', () => {
    const chart = chartWithBars(200);
    const time = T0 + 150 * MINUTE;
    const x = chart.timeScale.timeToX(time);

    expect(x).not.toBeNull();
    expect(chart.timeScale.xToTime(x ?? 0)).toBeCloseTo(time);
  });

  it('shows a requested time range', () => {
    const chart = chartWithBars(200);
    chart.timeScale.setVisibleRange({ from: T0 + 50 * MINUTE, to: T0 + 80 * MINUTE });

    expect(chart.timeScale.getVisibleRange()).toEqual({
      from: T0 + 50 * MINUTE,
      to: T0 + 80 * MINUTE
    });
  });

  it('pans with a mouse drag and reports visible range changes after the operation', async () => {
    const chart = chartWithBars(400);
    const changes = vi.fn();
    chart.on('visibleRangeChange', changes);
    const before = chart.timeScale.getVisibleRange();
    pointer(chart, 'pointerdown', 300, 200);
    pointer(chart, 'pointermove', 340, 200);
    pointer(chart, 'pointermove', 400, 200);
    pointer(chart, 'pointerup', 400, 200);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chart.timeScale.getVisibleRange()?.from).toBeLessThan(before?.from ?? 0);
    expect(changes).toHaveBeenCalled();
  });
});

describe('events', () => {
  it('dispatches events after the operation, so listeners can call back into the chart', () => {
    const chart = createTestChart();
    const seen: string[] = [];
    chart.on('visibleRangeChange', () => {
      seen.push(`length ${chart.data.length}`);
      chart.timeScale.scrollToRealTime();
    });
    chart.batch(() => {
      chart.data.set(createBars(50));
      seen.push('set done');
    });
    chart.timeScale.getVisibleRange();

    expect(seen[0]).toBe('set done');
    expect(seen).toContain('length 50');
  });

  it('emits crosshairMove for pointer movement once per frame, not for programmatic positions', async () => {
    const chart = chartWithBars(200);
    const moves = vi.fn();
    chart.on('crosshairMove', moves);
    chart.crosshair.set({ time: T0 + 180 * MINUTE });
    chart.screenshot();

    expect(moves).not.toHaveBeenCalled();
    expect(chart.crosshair.get()?.time).toBe(T0 + 180 * MINUTE);

    pointer(chart, 'pointermove', 200, 100, { buttons: 0 });
    pointer(chart, 'pointermove', 210, 100, { buttons: 0 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    chart.screenshot();

    expect(moves).toHaveBeenCalledTimes(1);
    expect(moves.mock.calls[0]?.[0]).toMatchObject({ visible: true, paneId: 'main' });
  });

  it('keeps the horizontal crosshair line at the pointer unless the magnet mode is on', async () => {
    const chart = chartWithBars(200);
    pointer(chart, 'pointermove', 200, 120, { buttons: 0 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    chart.screenshot();
    const free = chart.crosshair.get();

    expect(free?.y).toBe(120);
    expect(free?.price).not.toBe(free?.bar?.close);

    chart.applyOptions({ crosshair: { mode: 'magnet' } });
    pointer(chart, 'pointermove', 200, 120, { buttons: 0 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    chart.screenshot();
    const magnet = chart.crosshair.get();

    expect(magnet?.price).toBe(magnet?.bar?.close);
    expect(magnet?.x).toBe(free?.x);
  });
});
