# Indicators

[English](indicators.md) · [简体中文](zh-CN/indicators.md)

```ts
const id = chart.indicators.add({ type: 'BOLL', params: { period: 26 } });
chart.indicators.update(id, { colors: { mid: '#f5b942' } });
chart.indicators.remove(id);
```

## Adding an indicator

```ts
interface IndicatorInput {
  id?: string; // generated, e.g. 'macd-1'
  type: string; // 'MA', 'MACD', … or a registered custom type
  params?: Record<string, number | number[]>; // overrides of the defaults below
  pane?: string; // 'main', 'new' (a pane of its own) or an existing pane id
  source?: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4'; // default 'close'
  visible?: boolean;
  colors?: Record<string, string>; // per output key
}
```

Overlays default to the main pane, oscillators to a new pane. To put two oscillators in one pane, place the second one in the pane of the first:

```ts
const rsi = chart.indicators.add({ type: 'RSI' });
chart.indicators.add({ type: 'WR', pane: chart.indicators.get(rsi)!.pane });
```

Changing `params` or `source` recomputes the indicator; parameters are validated and unknown keys are rejected.

## Built-in indicators

Formulas follow the conventions of Chinese charting software (同花顺 / 通达信): EMAs and `SMA(X, N, 1)` smoothing are seeded with the first value, the MACD histogram is doubled, K and D of KDJ start at 50, and standard deviations are population deviations. A value that cannot be computed (warm-up, division by zero) is left empty rather than replaced by a number.

| Type   | Pane | Parameters (defaults)            | Outputs                                        |
| ------ | ---- | -------------------------------- | ---------------------------------------------- |
| `MA`   | main | `periods` [5, 10, 20, 30]        | `ma5`, `ma10`, …                               |
| `EMA`  | main | `periods` [12, 26]               | `ema12`, `ema26`                               |
| `SMMA` | main | `periods` [7, 14]                | `smma7`, `smma14` — smoothed (Wilder) average  |
| `BOLL` | main | `period` 20, `multiplier` 2      | `mid`, `upper`, `lower`                        |
| `VOL`  | new  | `periods` [5, 10]                | `volume` (columns), `ma5`, `ma10`              |
| `MACD` | new  | `fast` 12, `slow` 26, `signal` 9 | `dif`, `dea`, `macd` (columns)                 |
| `RSI`  | new  | `periods` [6, 12, 24]            | `rsi6`, `rsi12`, `rsi24`                       |
| `KDJ`  | new  | `period` 9, `k` 3, `d` 3         | `k`, `d`, `j`                                  |
| `WR`   | new  | `periods` [14, 28]               | `wr14`, `wr28` (0 at the high, 100 at the low) |
| `CCI`  | new  | `period` 14                      | `cci`                                          |
| `ROC`  | new  | `period` 12                      | `roc`                                          |
| `BIAS` | new  | `periods` [6, 12, 24]            | `bias6`, `bias12`, `bias24`                    |
| `OBV`  | new  | —                                | `obv`                                          |
| `VR`   | new  | `period` 24                      | `vr`                                           |
| `EMV`  | new  | `period` 14, `signal` 9          | `emv`, `maemv`                                 |
| `MFI`  | new  | `period` 14                      | `mfi`                                          |
| `ATR`  | new  | `period` 14                      | `atr`                                          |
| `STD`  | new  | `period` 20                      | `std`                                          |
| `DMI`  | new  | `period` 14                      | `pdi`, `mdi`, `adx`, `adxr`                    |

`periods` parameters accept up to eight values and draw one line each.

## Reading values

```ts
chart.indicators.valuesAt(id); // latest bar
chart.indicators.valuesAt(id, chart.crosshair.get()?.index ?? chart.data.length - 1);
// [{ key: 'dif', label: 'DIF', color: '#f5b942', value: 0.0293, text: '0.0293' }, …]
```

The chart also shows these values in each pane's legend (`options.legend.visible`). Alerts can watch any output; see [Trading](trading.md#alerts).

## Custom indicators

Register a type on a chart, then add it like a built-in one. The simplest form derives each value from the latest bars:

```ts
chart.indicators.register<{ period: number }>('MOM', {
  name: 'MOM',
  pane: 'new',
  precision: 2,
  params: { period: { default: 10, min: 1, integer: true } },
  outputs: () => [{ key: 'mom', label: 'MOM', plot: { kind: 'line' } }],
  levels: () => [0],
  lookback: ({ period }) => period + 1,
  compute: (window) => [window.price(window.length - 1) - window.price(0)]
});

chart.indicators.add({ type: 'MOM', params: { period: 20 } });
```

`compute()` receives the last `lookback` bars, oldest first, and returns one number per output (`NaN` for none). Until the window is full the outputs stay empty; from then on it is called once per bar.

For indicators whose value depends on the whole history, such as exponential averages, implement a streaming calculator instead. `next()` consumes one bar; `clone()` must copy all state, because the chart keeps a checkpoint before the latest bar and replays only that bar on every tick.

```ts
import type { Bar, IndicatorStream } from '@trading-chart-sdk/core';

class EmaStream implements IndicatorStream {
  constructor(
    private readonly alpha: number,
    private value = Number.NaN
  ) {}

  next(_bar: Bar, price: number): number[] {
    this.value = Number.isNaN(this.value) ? price : this.value + this.alpha * (price - this.value);
    return [this.value];
  }

  clone(): EmaStream {
    return new EmaStream(this.alpha, this.value);
  }
}

chart.indicators.register<{ period: number }>('MY_EMA', {
  name: 'EMA',
  pane: 'main',
  precision: 'price',
  params: { period: { default: 20, min: 1, integer: true } },
  outputs: () => [{ key: 'ema', label: 'EMA', plot: { kind: 'line' } }],
  create: ({ period }) => new EmaStream(2 / (period + 1))
});
```

### Definition reference

| Field                                                              | Description                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                             | Shown in the legend                                                                                                                                                 |
| `pane`                                                             | `'main'` or `'new'`: the default placement                                                                                                                          |
| `params`                                                           | `{ key: { default, min?, max?, integer?, label? } }`; an array default makes a list parameter                                                                       |
| `outputs(params)`                                                  | `[{ key, label, plot, color? }]` with `plot` one of `{ kind: 'line', style? }`, `{ kind: 'histogram', colorBy: 'sign' \| 'change' \| 'bar' }`, `{ kind: 'hidden' }` |
| `levels?(params)`                                                  | Horizontal reference lines                                                                                                                                          |
| `fills?`                                                           | `[{ from, to }]`: shade between two outputs                                                                                                                         |
| `precision`                                                        | Decimals, `'price'` (follow the main series) or `'volume'` (compact, e.g. `1.2M`)                                                                                   |
| `range?`                                                           | Fixed scale range of the pane, e.g. `{ min: 0, max: 100 }`                                                                                                          |
| `create(params)` or `lookback(params)` + `compute(window, params)` | The calculation                                                                                                                                                     |
