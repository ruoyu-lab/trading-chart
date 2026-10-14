# 交易：委托单、标记与预警

[English](../trading.md) · **简体中文**

委托单、标记和预警属于你的应用：你通过 `set()`（或 `add()`、`update()`、`remove()`）传入当前状态，图表负责显示，并报告用户对它们做了什么。这些调用从不触发事件，因此你可以把图表状态同步到 store 中再回传给图表，而不会造成循环。

## 委托单

```ts
chart.orders.set([
  {
    id: 'o-1842',
    side: 'buy',
    price: 101.5,
    label: 'LIMIT',
    quantity: 2,
    buttons: [{ id: 'cancel', icon: 'M6 6L18 18M18 6L6 18' }]
  },
  { id: 'o-1843', side: 'sell', price: 106, label: 'TP', quantity: 2, draggable: false }
]);
```

```ts
interface OrderInput {
  id: string;
  price: number;
  side: 'buy' | 'sell';
  label?: string; // 默认 'BUY' / 'SELL'
  quantity?: number | string;
  draggable?: boolean; // 默认 true
  visible?: boolean;
  color?: string; // 默认 theme.buy / theme.sell
  lineStyle?: 'solid' | 'dashed' | 'dotted'; // 默认 'dashed'
  buttons?: PriceLineButton[];
}
```

每个委托单都是一条横贯主图的线，靠近价格坐标处有一个标签，坐标轴上显示其价格。相邻委托单的标签会自动错开，不会重叠。

### 拖动

用户可以拖动委托单的线或标签。委托单会立即跟随指针移动，并停留在新价格上；价格按主序列的精度取整。

```ts
chart.on('orderDrag', async ({ id, phase, price, initialPrice }) => {
  if (phase !== 'end') {
    return; // 'start'、'move'，或按下 Escape 后的 'cancel'（此时价格已经还原）
  }

  const accepted = await broker.modifyOrder(id, price);

  if (!accepted) {
    chart.orders.update(id, { price: initialPrice });
  }
});
```

### 标签按钮

按钮显示在标签末尾。每个按钮需要提供 `text` 或 `icon`（24 × 24 方框内的 SVG 路径数据，例如 Lucide 或 Material 图标的路径）；路径数据不合法时会抛出错误。

```ts
interface PriceLineButton {
  id: string;
  text?: string;
  icon?: string;
  width?: number;
}

chart.on('buttonClick', ({ kind, id, buttonId }) => {
  if (kind === 'order' && buttonId === 'cancel') {
    broker.cancelOrder(id);
  }
});
```

点击按钮不会选中委托单；点击线或标签则会选中它（`selectionChange`）。

## 标记

标记用于把成交和信号固定在主图的 K 线上。

```ts
chart.markers.set([
  {
    id: 'fill-1',
    time: '2024-05-02T10:15:00Z',
    position: 'below',
    shape: 'arrow-up',
    text: 'Buy 2'
  },
  {
    id: 'fill-2',
    time: '2024-05-02T13:40:00Z',
    position: 'above',
    shape: 'arrow-down',
    text: 'Sell 2'
  },
  {
    id: 'stop',
    time: '2024-05-02T14:05:00Z',
    position: 'price',
    price: 99.8,
    shape: 'circle',
    color: '#f5b942'
  }
]);
```

| 字段                | 说明                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| `position`          | `above`：最高价上方；`below`：最低价下方；`price`：指定价格处                |
| `shape`             | `arrow-up`、`arrow-down`、`triangle-up`、`triangle-down`、`circle`、`square` |
| `color`             | 默认：向上的形状为 `theme.buy`，其余为 `theme.sell`                          |
| `text`、`size`（8） | 标签文字，以及以像素计的尺寸                                                 |

同一根 K 线上的多个标记会依次向外堆叠。标记可以点击（触发 `click`，其中 `target.kind === 'marker'`）和选中，但不能拖动。

## 预警

预警会监控一个数值，并在条件满足时触发 `alertTrigger`。

```ts
chart.alerts.add({ id: 'breakout', trigger: 'cross-up', value: 105, label: 'Breakout' });

chart.on('alertTrigger', ({ id, time, value, threshold }) => {
  notify(
    `${id}: ${value} crossed ${threshold} on the bar of ${new Date(time).toLocaleTimeString()}`
  );
});
```

```ts
interface AlertInput {
  id: string;
  source?: ValueSource; // 默认：主序列收盘价
  trigger: 'cross' | 'cross-up' | 'cross-down' | 'above' | 'below';
  value: number | ValueSource; // 固定价位，或用于比较的另一个数值
  frequency?: 'once' | 'once-per-bar' | 'once-per-bar-close' | 'every-time'; // 默认 'once'
  enabled?: boolean;
  label?: string;
  color?: string; // 默认 theme.alert
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  draggable?: boolean; // 默认 true
  visible?: boolean; // 是否显示固定价位的预警线
  buttons?: PriceLineButton[];
}

type ValueSource =
  | { kind: 'price'; field?: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' }
  | { kind: 'indicator'; id: string; key: string }
  | { kind: 'series'; id: string };
```

### 预警何时触发

- 每当 K 线通过 `data.update()` 发生变化时都会计算预警，与渲染无关，因此在后台标签页和隐藏的图表中同样有效。
- 加载历史数据（`set()`、`prepend()`）从不触发预警。
- 添加或修改预警不会立即触发它，即使条件已经满足。
- 穿越类条件会把每次计算的结果与上一次比较，因此当前 K 线内发生的穿越会逐 tick 检测到；一次更新包含多根新 K 线时，会逐根检查。

| 触发方式          | 条件                             |
| ----------------- | -------------------------------- |
| `cross-up`        | 数值从小于或等于阈值变为大于阈值 |
| `cross-down`      | 数值从大于或等于阈值变为小于阈值 |
| `cross`           | 任一方向的穿越                   |
| `above` / `below` | 数值高于 / 低于阈值              |

| 频率                 | 行为                                                       |
| -------------------- | ---------------------------------------------------------- |
| `once`               | 只触发一次；之后状态变为 `triggered`，直到调用 `rearm(id)` |
| `once-per-bar`       | 每根 K 线最多触发一次                                      |
| `once-per-bar-close` | 只计算已收盘的 K 线，在下一根 K 线开始时进行               |
| `every-time`         | 每次计算满足条件时都触发                                   |

### 基于指标和序列的预警

```ts
const macd = chart.indicators.add({ type: 'MACD' });

chart.alerts.add({
  id: 'macd-golden-cross',
  source: { kind: 'indicator', id: macd, key: 'dif' },
  trigger: 'cross-up',
  value: { kind: 'indicator', id: macd, key: 'dea' },
  frequency: 'once-per-bar-close'
});
```

有预警读取某个指标或序列时，该指标或序列不能被移除。

### 预警线

针对固定价位的预警会在其数据源所在的子图中绘制一条线。用户可以拖动这条线（`alertDrag`，与 `orderDrag` 相同），也可以点击其标签按钮（`buttonClick`，其中 `kind: 'alert'`）。已触发和已禁用的预警会以淡色显示。

```ts
chart.alerts.get('breakout'); // { …, status: 'triggered', triggeredAt: 1714651200000 }
chart.alerts.rearm('breakout');
chart.alerts.update('breakout', { enabled: false });
```
