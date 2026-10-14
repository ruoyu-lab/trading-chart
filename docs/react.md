# React

[English](react.md) · [简体中文](zh-CN/react.md)

```bash
npm install @trading-chart-sdk/core @trading-chart-sdk/react
```

The adapter is a thin layer over the core: a component for JSX and a hook for custom setups. Everything else goes through the chart instance. It supports React 18.3 and 19, works in StrictMode and is marked `'use client'`, so it can be imported from Next.js server components.

See it running in the [React demo](https://ruoyu-lab.github.io/trading-chart-sdk/react.html) ([source](../playground/src/react/app.ts)).

## Component

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

| Prop        | Applied with                                        |
| ----------- | --------------------------------------------------- |
| `options`   | `chart.applyOptions()` when a new object passes     |
| `data`      | `chart.data.set()` when a new array passes          |
| `orders`    | `chart.orders.set()` when a new array passes        |
| `markers`   | `chart.markers.set()` when a new array passes       |
| `alerts`    | `chart.alerts.set()` when a new array passes        |
| `className` | The chart's container element                       |
| `style`     | Merged over the default `width: 100%; height: 100%` |

Props are compared by reference, as React state is. Replace arrays immutably to apply a change, and keep `options` stable with `useMemo` or a module constant: an inline object literal is a new object on every render and would be applied every time.

Stream ticks with `chart.data.update()` instead of rebuilding the `data` array; pass a new array to load another symbol or interval.

Indicators, panes, drawings and the view are user-editable and saved with `chart.saveState()`; manage them through the instance.

### Events

Every [chart event](api.md#events) is an `on*` prop: `onCrosshairMove`, `onVisibleRangeChange`, `onLoadMore`, `onClick`, `onDoubleClick`, `onContextMenu`, `onSelectionChange`, `onPaneResize`, `onDrawingsChange`, `onToolChange`, `onOrderDrag`, `onAlertDrag`, `onButtonClick`, `onAlertTrigger`. `onReady` passes the chart instance once it is created and the props are applied.

Handlers may be new functions on every render; the component always calls the latest one without re-subscribing. Events without a handler are not subscribed, so an unused `crosshairMove` costs nothing.

### Getting the instance

A ref receives the chart instance (`null` until it is created and after unmount), and `onReady` passes it as well.

## Hook

`useTradingChart()` creates a chart in any element you render and destroys it when the element goes away. It returns a callback ref and the chart:

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

The chart is created when the element mounts, even if that happens after the component itself, and `chart` is `null` until then.

## Server rendering

The chart needs the DOM, so nothing is created on the server: the component renders an empty `<div>` and the chart appears after hydration. No `dynamic(() => import(...), { ssr: false })` wrapper is needed.
