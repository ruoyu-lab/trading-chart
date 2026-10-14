# 快速上手

[English](../getting-started.md) · **简体中文**

## 安装

```bash
npm install @trading-chart-sdk/core
```

包内提供带类型声明的 ES 模块，另附一个压缩版构建，供 `<script>` 标签直接引入，它会定义全局变量 `TradingChart`。

## 创建图表

```ts
import { createChart } from '@trading-chart-sdk/core';

const container = document.getElementById('chart')!;
const chart = createChart(container);
```

`createChart()` 会在容器内插入自己的元素并将其填满。请用 CSS 为容器设置尺寸，图表会通过 `ResizeObserver` 跟随尺寸变化。如果想自行控制尺寸，传入 `{ autoSize: false }` 并调用 `chart.resize(width, height)`。

不再使用时调用 `chart.destroy()`，它会移除元素，并释放所有监听器、观察器和定时器。

## 加载数据

K 线就是普通对象。`time` 可以是毫秒时间戳、ISO-8601 字符串或 `Date`；`volume` 可选。

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

`set()` 会校验每一根 K 线，遇到问题时抛出 `ChartError` 并指出第一个问题：时间未排序或重复、数值不是有限数，或者最高价/最低价没有涵盖开盘价和收盘价。图表会复制输入的数据，因此之后你可以继续复用或修改自己的数组。

## 推送实时数据

```ts
socket.onmessage = (message) => {
  chart.data.update(JSON.parse(message.data));
};
```

`update()` 在时间相同时替换最后一根 K 线，时间更新时追加新的 K 线，开销为 O(1)，所有指标的计算也包含在内。更早的 K 线会被拒绝；历史数据请通过 `set()` 或 `prepend()` 加载。

最新一根 K 线可见时，视图会跟随新 K 线移动；用户回看历史时，视图保持不动。

## 按需加载历史数据

```ts
chart.on('loadMore', async ({ before }) => {
  const older = await api.bars({ end: before, limit: 500 });
  chart.data.prepend(older);
});
```

当左侧隐藏的 K 线少于 `timeScale.loadMoreThreshold` 根时触发 `loadMore`，并且对同一根最早的 K 线只触发一次：实时 tick 不会让它重复触发，只有在插入历史数据之后，或者用户滚走再滚回来时，才会再次触发。`prepend()` 会忽略时间等于或晚于当前第一根 K 线的数据，因此分页之间有重叠也没关系。视图不会移动。

## 配置

可以在 `createChart()` 时传入配置项，也可以之后通过 `applyOptions()` 修改。两者都接受部分配置并进行深度合并；数组和函数会被整体替换。

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

非法配置项会抛出错误，图表保持不变。参见[全部配置项](api.md#配置项)。

### 红涨绿跌

主题颜色就是普通的值，按中国大陆的习惯可以这样设置：

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

### 价格与时间标签

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

## 添加指标

```ts
chart.indicators.add({ type: 'MA', params: { periods: [5, 10, 20, 60] } });
const macd = chart.indicators.add({ type: 'MACD' });
chart.indicators.update(macd, { params: { fast: 8 } });
```

MA、BOLL 等叠加指标共用主图；MACD 等震荡指标拥有独立的子图，移除指标后该子图也会随之消失。参见[技术指标](indicators.md)。

## 监听用户操作

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

事件只反映用户的操作。你通过 API 发起的调用从不触发事件，因此可以在监听器内部更新图表，或把图表状态同步到你的 store 中，而不会造成循环。监听器会在触发它的操作完成之后才运行。

## 保存用户布局

```ts
const state = chart.saveState();
localStorage.setItem('layout', JSON.stringify(state));

chart.loadState(JSON.parse(localStorage.getItem('layout')!));
```

状态包含主序列类型、视图、子图、指标和画线。行情数据、附加序列、委托单、标记和预警属于你的应用，不包含在内。`loadState()` 会先校验全部内容；状态不合法时抛出错误，不做任何改变。

## 下一步

- [API 参考](api.md)
- [画线工具](drawings.md)与[交易对象](trading.md)
- [Vue 3](vue.md)
- [React](react.md)
