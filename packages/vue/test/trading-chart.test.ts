import type { BarInput, Chart, OrderInput } from '@trading-chart-sdk/core';
import { describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { TradingChart } from '../src';

function bars(count: number, close = 100): BarInput[] {
  return Array.from({ length: count }, (_, index) => ({
    time: Date.UTC(2024, 0, 1) + index * 60_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close
  }));
}

function mount(render: () => ReturnType<typeof h>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(defineComponent({ setup: () => render }));
  app.mount(host);
  return {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    }
  };
}

describe('TradingChart', () => {
  it('creates the chart on mount, syncs props and destroys it on unmount', async () => {
    const data = ref(bars(10));
    const orders = ref<OrderInput[]>([{ id: 'o1', side: 'buy', price: 99 }]);
    let chart: Chart | null = null;
    const { host, unmount } = mount(() =>
      h(TradingChart, {
        data: data.value,
        orders: orders.value,
        onReady: (instance: Chart) => {
          chart = instance;
        }
      })
    );
    await nextTick();

    expect(chart).not.toBeNull();
    expect(host.querySelectorAll('canvas')).toHaveLength(3);
    expect((chart as Chart | null)?.data.length).toBe(10);

    data.value = bars(20);
    orders.value[0]!.price = 98;
    await nextTick();

    expect((chart as Chart | null)?.data.length).toBe(20);
    expect((chart as Chart | null)?.orders.get('o1')?.price).toBe(98);

    unmount();
    expect(host.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('re-emits chart events in kebab-case', async () => {
    const onAlertTrigger = vi.fn();
    let chart: Chart | null = null;
    mount(() =>
      h(TradingChart, {
        data: bars(10),
        alerts: [{ id: 'a', trigger: 'cross-up', value: 105 }],
        onReady: (instance: Chart) => {
          chart = instance;
        },
        onAlertTrigger
      })
    );
    await nextTick();
    (chart as Chart | null)?.data.update({ ...bars(10)[9]!, close: 110, high: 111 });

    expect(onAlertTrigger).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', value: 110 }));
  });

  it('applies option changes', async () => {
    const locale = ref('en-US');
    let chart: Chart | null = null;
    mount(() =>
      h(TradingChart, {
        options: { locale: locale.value },
        onReady: (instance: Chart) => {
          chart = instance;
        }
      })
    );
    await nextTick();
    locale.value = 'zh-CN';
    await nextTick();

    expect((chart as Chart | null)?.options().locale).toBe('zh-CN');
  });
});
