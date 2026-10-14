<div align="center">

# Trading Chart SDK

**与框架无关的 Canvas 交易图表 SDK：K 线、技术指标、画线工具、可拖动的委托单和价格预警，gzip 后仅 68 kB。**

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![version](https://img.shields.io/badge/version-0.1.0--beta.1-orange)](CHANGELOG.md)
[![CI](https://github.com/ruoyu-lab/trading-chart-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/ruoyu-lab/trading-chart-sdk/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](tsconfig.base.json)
[![gzip](https://img.shields.io/badge/gzip-68%20kB-brightgreen)](scripts/check-size.mjs)
[![works with](https://img.shields.io/badge/works%20with-Vanilla%20JS%20%7C%20Vue%203%20%7C%20React-informational)](#包)

[**在线演示**](https://ruoyu-lab.github.io/trading-chart-sdk/) · [English](README.md) · **简体中文**

</div>

---

<p align="center">
  <img src="docs/assets/screenshot-dark.png" alt="Trading Chart SDK：K 线、布林带、均线、成交量、MACD、斐波那契回撤、委托单和价格预警" width="100%">
</p>

Trading Chart SDK 用 Canvas 绘制金融图表，没有任何运行时依赖。在任意元素上调用 `createChart()` 创建图表，之后通过一套分模块、类型完整的 API 来驱动它：推送实时 K 线、添加指标、让用户画线、显示可拖动的委托单，并在价格预警触发时收到通知。

内核与框架完全解耦，在原生 JavaScript 中即可使用；官方适配包把它封装成开箱即用的组件：目前提供 [Vue 3](packages/vue) 和 [React](packages/react)。适配包用到的全部是公开 API，所以为任何其他框架封装也只需要几十行代码。

## 特性

<table>
<tr>
<td width="50%" valign="top">

### 📈 图表

- 11 种图形：蜡烛图、空心蜡烛、美国线（OHLC）、高低线、折线、阶梯线、带点折线、面积图、基线图、HLC 区域图、柱状图
- 任意数量的子图，拖动分隔线调整高度
- 每个子图独立的普通、对数、百分比和指数化坐标
- 按日历边界选择刻度的时间轴，支持任意语言和 IANA 时区
- 最新价线与收盘倒计时、OHLC 图例、十字光标
- 深色与浅色主题，所有颜色和字体均可配置

</td>
<td width="50%" valign="top">

### 🧮 技术指标

- 19 个内置指标：MA、EMA、SMMA、BOLL、VOL、MACD、RSI、KDJ、WR、CCI、ROC、BIAS、OBV、VR、EMV、MFI、ATR、STD、DMI
- 计算公式遵循同花顺 / 通达信的口径
- 流式计算：每个实时 tick 只计算一步，而不是全量重算
- 几行代码即可自定义指标：既可以基于最近 N 根 K 线计算，也可以编写完整的流式计算器

</td>
</tr>
<tr>
<td width="50%" valign="top">

### ✏️ 画线工具

- 13 种内置工具：趋势线、射线、延长线、箭头、水平线与水平射线、垂直线、矩形、平行通道、斐波那契回撤、价格区间、折线、文字
- 点击-点击或按下-拖动放置，可吸附到 OHLC 价格
- 拖动整条画线或单个锚点，支持锁定和隐藏
- 撤销与重做、键盘快捷键，通过一个小接口即可添加自定义工具

</td>
<td width="50%" valign="top">

### 💹 交易

- 用户可拖动改价的委托单，提供 `start → move → end` 事件，按 Esc 取消
- 委托单标签内可放文字或 SVG 图标按钮，例如就地撤单
- 固定在 K 线上的成交与信号标记
- 价格、指标和序列预警：上穿、下穿、穿越、高于、低于；仅一次、每根 K 线一次、收盘时、每次满足
- 预警在每次数据更新时计算，后台标签页中同样有效

</td>
</tr>
<tr>
<td width="50%" valign="top">

### ⚡ 性能

- 基于 TypedArray 的列式 K 线存储，实时更新为 O(1)
- 数据层、对象层、光标层三层画布各自独立重绘
- 所有工作合并到一个动画帧内完成，点缓冲区在帧之间复用
- 几十万根 K 线依然流畅；支持鼠标、触控板、触屏与双指缩放

</td>
<td width="50%" valign="top">

### 🧩 开发体验

- 每个配置项、事件和回调参数都有严格的 TypeScript 类型
- API 调用从不触发事件，只有用户操作才会，因此把状态回写给图表不会产生循环
- 非法输入会抛出 `ChartError` 并指出具体的值，不会被悄悄“修正”
- 以 JSON 保存和恢复用户布局（子图、指标、画线、视图）

</td>
</tr>
</table>

## 包

| 包                                           | 说明                   |
| -------------------------------------------- | ---------------------- |
| [`@trading-chart-sdk/core`](packages/core)   | 与框架无关的内核 SDK   |
| [`@trading-chart-sdk/vue`](packages/vue)     | Vue 3 组件与组合式函数 |
| [`@trading-chart-sdk/react`](packages/react) | React 组件与 Hook      |

## 快速开始

```bash
npm install @trading-chart-sdk/core
```

```ts
import { createChart } from '@trading-chart-sdk/core';

const chart = createChart(document.getElementById('chart')!, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai'
});

chart.data.set(bars); // [{ time, open, high, low, close, volume }]
chart.indicators.add({ type: 'MA', params: { periods: [5, 10, 20] } });
chart.indicators.add({ type: 'MACD' });

socket.onmessage = (event) => chart.data.update(JSON.parse(event.data));
```

图表会填满容器并跟随容器尺寸变化。`time` 可以是毫秒时间戳、ISO 字符串或 `Date` 对象。

<details>
<summary><b>不使用打包工具</b></summary>

```html
<script src="https://cdn.jsdelivr.net/npm/@trading-chart-sdk/core@0.1.0-beta.1"></script>
<div id="chart" style="height: 480px"></div>
<script>
  const chart = TradingChart.createChart(document.getElementById('chart'));
  chart.data.set(bars);
</script>
```

</details>

### Vue 3

```bash
npm install @trading-chart-sdk/core @trading-chart-sdk/vue
```

```vue
<script setup lang="ts">
import { TradingChart } from '@trading-chart-sdk/vue';
import type { Chart } from '@trading-chart-sdk/core';

function onReady(chart: Chart) {
  chart.indicators.add({ type: 'VOL' });
}
</script>

<template>
  <TradingChart
    style="height: 480px"
    :data="bars"
    :orders="orders"
    :options="{ locale: 'zh-CN' }"
    @ready="onReady"
    @order-drag="(event) => event.phase === 'end' && moveOrder(event.id, event.price)"
  />
</template>
```

### React

```bash
npm install @trading-chart-sdk/core @trading-chart-sdk/react
```

```tsx
import { TradingChart } from '@trading-chart-sdk/react';
import type { Chart } from '@trading-chart-sdk/core';

const options = { locale: 'zh-CN' };
const onReady = (chart: Chart) => chart.indicators.add({ type: 'VOL' });

export const View = () => (
  <TradingChart
    style={{ height: 480 }}
    data={bars}
    orders={orders}
    options={options}
    onReady={onReady}
    onOrderDrag={(event) => event.phase === 'end' && moveOrder(event.id, event.price)}
  />
);
```

### 红涨绿跌

主题颜色就是普通的配置值，按国内习惯设置即可：

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

## 进一步了解

**按需加载历史数据。** 当用户滚动到接近最早的 K 线时，`loadMore` 会请求更多数据。每一页只触发一次，实时 tick 永远不会触发它。

```ts
chart.on('loadMore', async ({ before }) => {
  chart.data.prepend(await api.bars({ end: before, limit: 500 }));
});
```

**用户可拖动的委托单。** 委托线会立即跟随指针移动，之后的处理交给你的交易接口决定。

```ts
chart.orders.set([
  {
    id: 'o-1',
    side: 'buy',
    price: 101.5,
    label: 'LIMIT',
    quantity: 2,
    buttons: [{ id: 'cancel', icon: 'M6 6L18 18M18 6L6 18' }]
  }
]);

chart.on('orderDrag', async ({ id, phase, price, initialPrice }) => {
  if (phase === 'end' && !(await broker.modify(id, price))) {
    chart.orders.update(id, { price: initialPrice });
  }
});

chart.on('buttonClick', ({ id, buttonId }) => buttonId === 'cancel' && broker.cancel(id));
```

**对任意数值设置预警。** 可以监控价格、指标输出或另一条序列。

```ts
const macd = chart.indicators.add({ type: 'MACD' });
chart.alerts.add({
  id: 'golden-cross',
  source: { kind: 'indicator', id: macd, key: 'dif' },
  trigger: 'cross-up',
  value: { kind: 'indicator', id: macd, key: 'dea' },
  frequency: 'once-per-bar-close'
});
chart.on('alertTrigger', ({ id, time, value }) => notify(id, time, value));
```

**自定义指标。** 只需根据最近几根 K 线算出数值，其余交给图表处理。

```ts
chart.indicators.register<{ period: number }>('MOM', {
  name: 'MOM',
  pane: 'new',
  precision: 2,
  params: { period: { default: 10, min: 1, integer: true } },
  outputs: () => [{ key: 'mom', label: 'MOM', plot: { kind: 'line' } }],
  lookback: ({ period }) => period + 1,
  compute: (window) => [window.price(window.length - 1) - window.price(0)]
});
```

**可持久化的布局。** 子图、指标、画线和视图都可以通过 JSON 保存与恢复。恢复是原子操作：状态不合法时会抛出错误，图表保持不变。

```ts
localStorage.setItem('layout', JSON.stringify(chart.saveState()));
chart.loadState(JSON.parse(localStorage.getItem('layout')!));
```

## 文档

|                                           |                                  |
| ----------------------------------------- | -------------------------------- |
| [快速上手](docs/zh-CN/getting-started.md) | 安装、数据、尺寸、主题、实时更新 |
| [API 参考](docs/zh-CN/api.md)             | 所有方法、配置项和事件           |
| [技术指标](docs/zh-CN/indicators.md)      | 内置指标及参数、自定义指标       |
| [画线工具](docs/zh-CN/drawings.md)        | 工具、编辑、撤销、自定义画线类型 |
| [交易](docs/zh-CN/trading.md)             | 委托单、标记与预警               |
| [Vue](docs/zh-CN/vue.md)                  | Vue 3 组件与组合式函数           |
| [React](docs/zh-CN/react.md)              | React 组件与 Hook                |
| [架构](docs/zh-CN/architecture.md)        | 内核的设计，面向贡献者           |

可以直接打开[在线演示](https://ruoyu-lab.github.io/trading-chart-sdk/)，或运行 `npm install && npm run dev` 在本地启动。

## 浏览器支持

Chrome、Edge、Firefox 和 Safari（含 iOS Safari）的最新两个版本。图表依赖 Canvas 2D、Pointer Events、`ResizeObserver` 和 `Intl`，缺少任何一项都会抛出指明该 API 的 `ChartError`。

## 开发

```bash
npm install
npm run dev          # 演示页面 http://localhost:5180
npm test             # 单元测试
npm run test:e2e     # Chromium、Firefox、WebKit
npm run verify       # 架构、lint、格式、类型、测试、构建、包体积
```

## 路线图

- 更多画线工具（安德鲁音叉、江恩、艾略特波浪）
- 在同一百分比坐标上对比多个品种

## 许可证

[MIT](LICENSE) © 2026 ruoyu-lab
