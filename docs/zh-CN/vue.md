# Vue 3

[English](../vue.md) · **简体中文**

```bash
npm install @trading-chart-sdk/core @trading-chart-sdk/vue
```

适配包是内核之上的一层薄封装：一个在模板中使用的组件，以及一个用于自定义场景的组合式函数。其余一切都通过图表实例完成。

## 组件

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

| Prop      | 应用方式                            |
| --------- | ----------------------------------- |
| `options` | `chart.applyOptions()`（深度监听）  |
| `data`    | 数组被替换时调用 `chart.data.set()` |
| `orders`  | `chart.orders.set()`（深度监听）    |
| `markers` | `chart.markers.set()`（深度监听）   |
| `alerts`  | `chart.alerts.set()`（深度监听）    |

`data` 只按引用监听，因此即使数组很大，两次更新之间也没有任何开销。请用 `chart.data.update()` 推送 tick，而不是重建数组；切换品种或周期时再替换数组。

指标、子图、画线和视图可由用户编辑，并通过 `chart.saveState()` 保存；请通过图表实例管理它们。

### 事件

所有[图表事件](api.md#事件)都会以 kebab-case 形式重新派发：`@crosshair-move`、`@visible-range-change`、`@load-more`、`@click`、`@double-click`、`@context-menu`、`@selection-change`、`@pane-resize`、`@drawings-change`、`@tool-change`、`@order-drag`、`@alert-drag`、`@button-click`、`@alert-trigger`。`@ready` 会在图表创建后传出图表实例。

### 获取实例

`@ready` 会在图表创建后传出图表实例；像上面的示例那样把它保存在 `shallowRef` 中，即可在组件内任意位置调用 API。

## 组合式函数

`useTradingChart()` 会在你渲染的任意元素中创建图表，并在组件卸载时销毁它：

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

第二个参数可以是配置项对象、ref 或 getter；其变化会通过 `applyOptions()` 应用。

## 其他框架

Vue 适配包只有约 150 行公开 API 调用。[React 适配包](react.md)采用的也是同样的做法，Svelte、Angular 或 Web Components 同样适用：在 effect 中创建图表，在清理时销毁，props 变化时调用 `set()`，并转发 `chart.on()` 事件。
