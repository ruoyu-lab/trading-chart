import type { BarInput, Chart, ChartOptionsInput, OrderInput } from '@trading-chart-sdk/core';
import { act, createElement, StrictMode, useEffect, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TradingChart, useTradingChart, type TradingChartProps } from '../src';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function bars(count: number, close = 100): BarInput[] {
  return Array.from({ length: count }, (_, index) => ({
    time: Date.UTC(2024, 0, 1) + index * 60_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close
  }));
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

function render(element: ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(element);
  });
  const unmount = () => {
    act(() => {
      root.unmount();
    });
    host.remove();
  };
  cleanups.push(unmount);
  return {
    host,
    rerender: (next: ReactElement) => {
      act(() => {
        root.render(next);
      });
    },
    unmount: () => {
      cleanups.splice(cleanups.indexOf(unmount), 1);
      unmount();
    }
  };
}

function chartOf(props: TradingChartProps = {}) {
  let chart: Chart | null = null;
  const onReady = (instance: Chart) => {
    chart = instance;
  };
  const view = render(createElement(TradingChart, { ...props, onReady }));
  return {
    ...view,
    chart: () => chart ?? expect.unreachable('The chart was not created.'),
    rerender: (next: TradingChartProps) => {
      view.rerender(createElement(TradingChart, { ...next, onReady }));
    }
  };
}

describe('TradingChart', () => {
  it('creates the chart with its props applied, syncs changes and destroys it on unmount', () => {
    const orders: OrderInput[] = [{ id: 'o1', side: 'buy', price: 99 }];
    const view = chartOf({ data: bars(10), orders });

    expect(view.host.querySelectorAll('canvas')).toHaveLength(3);
    expect(view.chart().data.length).toBe(10);
    expect(view.chart().orders.get('o1')?.price).toBe(99);

    view.rerender({ data: bars(20), orders: [{ ...orders[0]!, price: 98 }] });

    expect(view.chart().data.length).toBe(20);
    expect(view.chart().orders.get('o1')?.price).toBe(98);

    view.unmount();
    expect(view.host.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('passes the instance through a ref', () => {
    const ref = { current: null as Chart | null };
    render(createElement(TradingChart, { ref, data: bars(5) }));

    expect(ref.current?.data.length).toBe(5);
  });

  it('forwards chart events to the latest handler', () => {
    const first = vi.fn();
    const second = vi.fn();
    const alerts = [{ id: 'a', trigger: 'cross-up' as const, value: 105 }];
    const data = bars(10);
    const view = chartOf({ data, alerts, onAlertTrigger: first });
    view.rerender({ data, alerts, onAlertTrigger: second });
    act(() => {
      view.chart().data.update({ ...data[9]!, close: 110, high: 111 });
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', value: 110 }));
  });

  it('applies new options objects', () => {
    const view = chartOf({ options: { locale: 'en-US' } });
    expect(view.chart().options().locale).toBe('en-US');

    view.rerender({ options: { locale: 'zh-CN' } });
    expect(view.chart().options().locale).toBe('zh-CN');
  });

  it('survives StrictMode, leaving exactly one live chart', () => {
    const ready = vi.fn();
    const { host } = render(
      createElement(
        StrictMode,
        null,
        createElement(TradingChart, { data: bars(5), onReady: ready })
      )
    );
    const last = ready.mock.calls.at(-1)?.[0] as Chart;

    expect(host.querySelectorAll('canvas')).toHaveLength(3);
    expect(last.data.length).toBe(5);
    expect(() => {
      last.timeScale.reset();
    }).not.toThrow();
  });
});

describe('useTradingChart', () => {
  it('creates the chart once its element is rendered', () => {
    const seen: Array<Chart | null> = [];
    const options: ChartOptionsInput = { locale: 'zh-CN' };

    function View({ visible }: { visible: boolean }) {
      const [ref, chart] = useTradingChart(options);

      useEffect(() => {
        seen.push(chart);
        chart?.data.set(bars(3));
      }, [chart]);

      return visible ? createElement('div', { ref }) : null;
    }

    const view = render(createElement(View, { visible: false }));
    expect(seen.at(-1)).toBeNull();

    view.rerender(createElement(View, { visible: true }));
    const chart = seen.at(-1);
    expect(chart?.data.length).toBe(3);
    expect(chart?.options().locale).toBe('zh-CN');

    view.rerender(createElement(View, { visible: false }));
    expect(seen.at(-1)).toBeNull();
    expect(() => chart?.data.set([])).toThrow('destroyed');
  });
});
