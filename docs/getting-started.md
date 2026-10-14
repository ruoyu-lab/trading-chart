# Getting started

[English](getting-started.md) · [简体中文](zh-CN/getting-started.md)

## Install

```bash
npm install @trading-chart-sdk/core
```

The package ships ES modules with bundled type declarations, plus a minified build that defines a global `TradingChart` for `<script>` tags.

## Create a chart

```ts
import { createChart } from '@trading-chart-sdk/core';

const container = document.getElementById('chart')!;
const chart = createChart(container);
```

`createChart()` appends its own element to the container and fills it. Give the container a size with CSS; the chart follows size changes with a `ResizeObserver`. To size the chart yourself, pass `{ autoSize: false }` and call `chart.resize(width, height)`.

Call `chart.destroy()` when you are done. It removes the element and releases every listener, observer and timer.

## Load data

Bars are plain objects. `time` is epoch milliseconds, an ISO-8601 string or a `Date`; `volume` is optional.

```ts
chart.data.set([
  {
    time: '2024-05-02T09:30:00Z',
    open: 101.2,
    high: 102.0,
    low: 100.8,
    close: 101.7,
    volume: 12000
  },
  { time: '2024-05-02T09:31:00Z', open: 101.7, high: 101.9, low: 101.1, close: 101.3, volume: 9800 }
]);
```

`set()` validates every bar and throws a `ChartError` that names the first problem: unsorted or duplicate times, non-finite numbers, or a high/low that does not enclose open and close. The chart copies the input, so you may reuse or mutate your array afterwards.

## Stream real-time data

```ts
socket.onmessage = (message) => {
  chart.data.update(JSON.parse(message.data));
};
```

`update()` replaces the last bar when the time matches and appends newer bars. It costs O(1), including every indicator. Older bars are rejected; history is loaded with `set()` or `prepend()`.

When the latest bar is visible, the view follows new bars. When the user has scrolled back in time, the view stays where it is.

## Load history on demand

```ts
chart.on('loadMore', async ({ before }) => {
  const older = await api.bars({ end: before, limit: 500 });
  chart.data.prepend(older);
});
```

`loadMore` fires when fewer than `timeScale.loadMoreThreshold` bars are hidden on the left, once for each oldest bar: it does not repeat on real-time ticks, and fires again only after history was prepended or the user scrolled away and back. `prepend()` ignores bars at or after the current first bar, so overlapping pages are fine. The view does not move.

## Configure

Pass options to `createChart()` or change them later with `applyOptions()`. Both take partial objects that are merged deeply; arrays and functions are replaced.

```ts
import { createChart, lightTheme } from '@trading-chart-sdk/core';

const chart = createChart(container, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  theme: lightTheme,
  mainSeries: { type: 'candles' },
  latestPrice: { countdown: true },
  priceScale: { precision: 2 }
});

chart.applyOptions({ crosshair: { mode: 'magnet' } });
```

Invalid options throw and leave the chart unchanged. See [all options](api.md#options).

### Red up, green down

Theme colors are plain values. For the convention used in mainland China:

```ts
chart.applyOptions({
  theme: {
    up: '#f2495e',
    down: '#22c58b',
    volumeUp: 'rgba(242, 73, 94, 0.45)',
    volumeDown: 'rgba(34, 197, 139, 0.45)'
  }
});
```

### Price and time labels

```ts
chart.applyOptions({
  priceScale: {
    formatter: (value, { mode }) =>
      mode === 'percent' ? `${value.toFixed(1)}%` : `$${value.toFixed(2)}`
  },
  timeScale: {
    formatter: (time, { kind, unit }) =>
      kind === 'axis' && unit === 'day'
        ? new Date(time).toLocaleDateString()
        : new Date(time).toISOString()
  }
});
```

## Add indicators

```ts
chart.indicators.add({ type: 'MA', params: { periods: [5, 10, 20, 60] } });
const macd = chart.indicators.add({ type: 'MACD' });
chart.indicators.update(macd, { params: { fast: 8 } });
```

Overlays such as MA and BOLL share the main pane; oscillators such as MACD get a pane of their own, which disappears again when the indicator is removed. See [Indicators](indicators.md).

## Listen to the user

```ts
chart.on('crosshairMove', (event) => {
  if (event.visible && event.bar) {
    tooltip.show(event.bar);
  }
});

chart.on('click', ({ target, price }) => {
  console.log(target ? `clicked ${target.kind} ${target.id}` : `clicked at ${price}`);
});
```

Events report what the user did. Calls you make through the API never emit events, so you can update the chart from inside a listener, or mirror its state in your store, without causing loops. Listeners run after the operation that triggered them has completed.

## Save the user's layout

```ts
const state = chart.saveState();
localStorage.setItem('layout', JSON.stringify(state));

chart.loadState(JSON.parse(localStorage.getItem('layout')!));
```

The state holds the main series type, the view, panes, indicators and drawings. Market data, additional series, orders, markers and alerts belong to your application and are not included. `loadState()` validates everything first; an invalid state throws and changes nothing.

## Next steps

- [API reference](api.md)
- [Drawings](drawings.md) and [trading objects](trading.md)
- [Vue 3](vue.md)
- [React](react.md)
