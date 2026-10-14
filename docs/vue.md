# Vue 3

[English](vue.md) · [简体中文](zh-CN/vue.md)

```bash
npm install @trading-chart-sdk/core @trading-chart-sdk/vue
```

The adapter is a thin layer over the core: a component for templates and a composable for custom setups. Everything else goes through the chart instance.

## Component

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { TradingChart } from '@trading-chart-sdk/vue';
import type { BarInput, Chart, OrderInput, PriceDragEvent } from '@trading-chart-sdk/core';

const bars = shallowRef<BarInput[]>(await api.bars());
const orders = ref<OrderInput[]>([{ id: 'o-1', side: 'buy', price: 101.5, label: 'LIMIT' }]);
const chart = shallowRef<Chart | null>(null);

function onReady(instance: Chart) {
  chart.value = instance;
  instance.indicators.add({ type: 'MACD' });
  socket.onmessage = (message) => instance.data.update(JSON.parse(message.data));
}

function onOrderDrag({ id, phase, price }: PriceDragEvent) {
  if (phase === 'end') {
    orders.value = orders.value.map((order) => (order.id === id ? { ...order, price } : order));
  }
}
</script>

<template>
  <TradingChart
    class="chart"
    :data="bars"
    :orders="orders"
    :options="{ locale: 'zh-CN', latestPrice: { countdown: true } }"
    @ready="onReady"
    @order-drag="onOrderDrag"
    @load-more="({ before }) => loadOlder(before)"
  />
</template>

<style scoped>
.chart {
  height: 520px;
}
</style>
```

### Props

| Prop      | Applied with                                      |
| --------- | ------------------------------------------------- |
| `options` | `chart.applyOptions()` (deep-watched)             |
| `data`    | `chart.data.set()` whenever the array is replaced |
| `orders`  | `chart.orders.set()` (deep-watched)               |
| `markers` | `chart.markers.set()` (deep-watched)              |
| `alerts`  | `chart.alerts.set()` (deep-watched)               |

`data` is watched by reference only, so a large array costs nothing between updates. Stream ticks with `chart.data.update()` instead of rebuilding the array; replace the array to load a new symbol or interval.

Indicators, panes, drawings and the view are user-editable and saved with `chart.saveState()`; manage them through the instance.

### Events

Every [chart event](api.md#events) is re-emitted in kebab case: `@crosshair-move`, `@visible-range-change`, `@load-more`, `@click`, `@double-click`, `@context-menu`, `@selection-change`, `@pane-resize`, `@drawings-change`, `@tool-change`, `@order-drag`, `@alert-drag`, `@button-click`, `@alert-trigger`. `@ready` passes the chart instance once it is created.

### Getting the instance

`@ready` passes the chart once it is created; keep it in a `shallowRef` to call the API from anywhere in the component, as in the example above.

## Composable

`useTradingChart()` creates a chart in any element you render and destroys it on unmount:

```vue
<script setup lang="ts">
import { useTemplateRef, watchEffect } from 'vue';
import { useTradingChart } from '@trading-chart-sdk/vue';

const container = useTemplateRef<HTMLDivElement>('container');
const chart = useTradingChart(container, () => ({ theme: isDark.value ? darkTheme : lightTheme }));

watchEffect(() => chart.value?.data.set(bars.value));
</script>

<template>
  <div ref="container" class="chart" />
</template>
```

The second argument may be options, a ref or a getter; changes are applied with `applyOptions()`.

## Other frameworks

The Vue adapter is about 150 lines of public API calls. The [React adapter](react.md) follows the same approach, and so would Svelte, Angular or Web Components: create the chart in an effect, destroy it on cleanup, call `set()` when props change and forward `chart.on()` events.
