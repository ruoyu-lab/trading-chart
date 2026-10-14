# React

[English](../react.md) · **简体中文**

```bash
npm install @trading-chart-sdk/core @trading-chart-sdk/react
```

适配包是内核之上的一层薄封装：一个在 JSX 中使用的组件，以及一个用于自定义场景的 Hook。其余一切都通过图表实例完成。支持 React 18.3 和 19，兼容 StrictMode，并且已标记为 `'use client'`，可以直接在 Next.js 的服务端组件中引入。

可以在 [React 演示页面](https://ruoyu-lab.github.io/trading-chart-sdk/react.html)中查看实际效果（[源码](../../playground/src/react/app.ts)）。

## 组件

```tsx
import { useMemo, useRef, useState } from 'react';
import { TradingChart } from '@trading-chart-sdk/react';
import {
  darkTheme,
  type BarInput,
  type Chart,
  type OrderInput,
  type PriceDragEvent
} from '@trading-chart-sdk/core';

export function Terminal({ bars }: { bars: BarInput[] }) {
  const chart = useRef<Chart>(null);
  const [orders, setOrders] = useState<OrderInput[]>([
    { id: 'o-1', side: 'buy', price: 101.5, label: 'LIMIT' }
  ]);
  const options = useMemo(() => ({ locale: 'zh-CN', theme: darkTheme }), []);

  function onReady(instance: Chart) {
    instance.indicators.add({ type: 'MACD' });
    socket.onmessage = (message) => instance.data.update(JSON.parse(message.data));
  }

  function onOrderDrag({ id, phase, price }: PriceDragEvent) {
    if (phase === 'end') {
      setOrders((current) =>
        current.map((order) => (order.id === id ? { ...order, price } : order))
      );
    }
  }

  return (
    <TradingChart
      ref={chart}
      style={{ height: 520 }}
      data={bars}
      orders={orders}
      options={options}
      onReady={onReady}
      onOrderDrag={onOrderDrag}
      onLoadMore={({ before }) => loadOlder(before)}
    />
  );
}
```

### Props

| Prop        | 生效方式                                      |
| ----------- | --------------------------------------------- |
| `options`   | 传入新对象时调用 `chart.applyOptions()`       |
| `data`      | 传入新数组时调用 `chart.data.set()`           |
| `orders`    | 传入新数组时调用 `chart.orders.set()`         |
| `markers`   | 传入新数组时调用 `chart.markers.set()`        |
| `alerts`    | 传入新数组时调用 `chart.alerts.set()`         |
| `className` | 作用于图表的容器元素                          |
| `style`     | 合并在默认的 `width: 100%; height: 100%` 之上 |

和 React 的 state 一样，props 按引用比较。修改数组时请以不可变的方式替换；`options` 请用 `useMemo` 或模块级常量保持稳定：内联的对象字面量每次渲染都是新对象，会被反复应用。

实时 tick 请用 `chart.data.update()` 推送，不要重建 `data` 数组；切换品种或周期时再传入新数组。

指标、子图、画线和视图都可以由用户编辑，并通过 `chart.saveState()` 保存；请通过图表实例管理它们。

### 事件

每个[图表事件](api.md#事件)都对应一个 `on*` prop：`onCrosshairMove`、`onVisibleRangeChange`、`onLoadMore`、`onClick`、`onDoubleClick`、`onContextMenu`、`onSelectionChange`、`onPaneResize`、`onDrawingsChange`、`onToolChange`、`onOrderDrag`、`onAlertDrag`、`onButtonClick`、`onAlertTrigger`。`onReady` 会在图表创建完成、props 已应用之后传入图表实例。

事件处理函数每次渲染都可以是新函数，组件始终调用最新的那个，且不会重新订阅。没有传处理函数的事件不会被订阅，所以不用 `crosshairMove` 就不会有任何开销。

### 获取实例

通过 ref 可以拿到图表实例（创建之前和卸载之后为 `null`），`onReady` 也会传入它。

## Hook

`useTradingChart()` 在你渲染的任意元素中创建图表，并在元素移除时销毁。它返回一个回调 ref 和图表实例：

```tsx
import { useEffect, useMemo } from 'react';
import { darkTheme, lightTheme, type BarInput } from '@trading-chart-sdk/core';
import { useTradingChart } from '@trading-chart-sdk/react';

function Chart({ bars, dark }: { bars: BarInput[]; dark: boolean }) {
  const options = useMemo(() => ({ theme: dark ? darkTheme : lightTheme }), [dark]);
  const [ref, chart] = useTradingChart(options);

  useEffect(() => {
    chart?.data.set(bars);
  }, [chart, bars]);

  return <div ref={ref} className="chart" />;
}
```

元素挂载时才会创建图表，即使它比组件本身晚出现也没问题；在此之前 `chart` 为 `null`。

## 服务端渲染

图表依赖 DOM，所以服务端不会创建任何东西：组件只渲染一个空的 `<div>`，图表在 hydration 之后出现。不需要再用 `dynamic(() => import(...), { ssr: false })` 包一层。
