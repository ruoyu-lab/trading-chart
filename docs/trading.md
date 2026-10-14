# Trading: orders, markers and alerts

[English](trading.md) · [简体中文](zh-CN/trading.md)

Orders, markers and alerts belong to your application: you pass the current state with `set()` (or `add()`, `update()`, `remove()`), and the chart shows it and reports what the user does with it. These calls never emit events, so you can mirror the chart state in your store and feed it back without loops.

## Orders

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
  label?: string; // default 'BUY' / 'SELL'
  quantity?: number | string;
  draggable?: boolean; // default true
  visible?: boolean;
  color?: string; // default theme.buy / theme.sell
  lineStyle?: 'solid' | 'dashed' | 'dotted'; // default 'dashed'
  buttons?: PriceLineButton[];
}
```

Each order is a line across the main pane with a label near the price axis and its price on the axis. Labels of nearby orders move apart so they never overlap.

### Dragging

The user drags an order by its line or label. The order follows the pointer at once and keeps its new price; prices are rounded to the main series precision.

```ts
chart.on('orderDrag', async ({ id, phase, price, initialPrice }) => {
  if (phase !== 'end') {
    return; // 'start', 'move', or 'cancel' after Escape (the price is already restored)
  }

  const accepted = await broker.modifyOrder(id, price);

  if (!accepted) {
    chart.orders.update(id, { price: initialPrice });
  }
});
```

### Label buttons

Buttons appear at the end of the label. Give each one a `text` or an `icon` (SVG path data in a 24 × 24 box, such as the paths of Lucide or Material icons); invalid path data throws.

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

Clicking a button does not select the order. Clicking the line or label selects it (`selectionChange`).

## Markers

Markers pin executions and signals to bars of the main pane.

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

| Field              | Description                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| `position`         | `above` the high, `below` the low, or at `price`                             |
| `shape`            | `arrow-up`, `arrow-down`, `triangle-up`, `triangle-down`, `circle`, `square` |
| `color`            | Default: `theme.buy` for upward shapes, `theme.sell` otherwise               |
| `text`, `size` (8) | Label and size in pixels                                                     |

Several markers on one bar stack away from it. Markers are clickable (`click` with `target.kind === 'marker'`) and selectable, but not draggable.

## Alerts

An alert watches a value and fires `alertTrigger` when a condition is met.

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
  source?: ValueSource; // default: main close
  trigger: 'cross' | 'cross-up' | 'cross-down' | 'above' | 'below';
  value: number | ValueSource; // a level, or another value to compare with
  frequency?: 'once' | 'once-per-bar' | 'once-per-bar-close' | 'every-time'; // default 'once'
  enabled?: boolean;
  label?: string;
  color?: string; // default theme.alert
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  draggable?: boolean; // default true
  visible?: boolean; // show the line of a level
  buttons?: PriceLineButton[];
}

type ValueSource =
  | { kind: 'price'; field?: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' }
  | { kind: 'indicator'; id: string; key: string }
  | { kind: 'series'; id: string };
```

### When alerts fire

- Alerts are evaluated whenever bars change through `data.update()`, independently of rendering. They work in background tabs and in hidden charts.
- Loading history (`set()`, `prepend()`) never fires alerts.
- Adding or changing an alert never fires it immediately, even if its condition already holds.
- Crossings compare each evaluation with the previous one, so a crossing within the current bar is detected tick by tick; an update with several new bars checks each of them.

| Trigger           | Condition                                                  |
| ----------------- | ---------------------------------------------------------- |
| `cross-up`        | The value moves from at or below the threshold to above it |
| `cross-down`      | The value moves from at or above the threshold to below it |
| `cross`           | Either crossing                                            |
| `above` / `below` | The value is above / below the threshold                   |

| Frequency            | Behavior                                                     |
| -------------------- | ------------------------------------------------------------ |
| `once`               | Fires once; the status becomes `triggered` until `rearm(id)` |
| `once-per-bar`       | Fires at most once per bar                                   |
| `once-per-bar-close` | Evaluates closed bars only, when the next bar starts         |
| `every-time`         | Fires on every evaluation that meets the condition           |

### Alerts on indicators and series

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

An indicator or series cannot be removed while an alert reads it.

### Alert lines

Alerts on a fixed level draw a line in the pane of their source. The user can drag it (`alertDrag`, like `orderDrag`) and click its label buttons (`buttonClick` with `kind: 'alert'`). Triggered and disabled alerts are drawn faded.

```ts
chart.alerts.get('breakout'); // { …, status: 'triggered', triggeredAt: 1714651200000 }
chart.alerts.rearm('breakout');
chart.alerts.update('breakout', { enabled: false });
```
