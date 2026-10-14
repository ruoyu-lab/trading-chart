# 技术指标

[English](../indicators.md) · **简体中文**

```ts
const id = chart.indicators.add({ type: 'BOLL', params: { period: 26 } });
chart.indicators.update(id, { colors: { mid: '#f5b942' } });
chart.indicators.remove(id);
```

## 添加指标

```ts
interface IndicatorInput {
  id?: string; // 自动生成，例如 'macd-1'
  type: string; // 'MA'、'MACD' 等，或已注册的自定义类型
  params?: Record<string, number | number[]>; // 覆盖下文列出的默认值
  pane?: string; // 'main'、'new'（独立子图）或已有子图的 id
  source?: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4'; // 默认 'close'
  visible?: boolean;
  colors?: Record<string, string>; // 按输出的 key 指定
}
```

叠加指标默认放在主图，震荡指标默认放在新的子图。要把两个震荡指标放进同一个子图，把第二个指标放到第一个指标所在的子图即可：

```ts
const rsi = chart.indicators.add({ type: 'RSI' });
chart.indicators.add({ type: 'WR', pane: chart.indicators.get(rsi)!.pane });
```

修改 `params` 或 `source` 会重新计算指标；参数会经过校验，未知的键会被拒绝。

## 内置指标

计算公式遵循国内看盘软件（同花顺 / 通达信）的口径：EMA 和 `SMA(X, N, 1)` 平滑以第一个值作为初始值，MACD 柱乘以 2，KDJ 的 K 和 D 从 50 起算，标准差为总体标准差。无法计算的值（预热期、除以零）留空，而不是用某个数字代替。

| 类型   | 子图   | 参数（默认值）                   | 输出                                           |
| ------ | ------ | -------------------------------- | ---------------------------------------------- |
| `MA`   | 主图   | `periods` [5, 10, 20, 30]        | `ma5`、`ma10`……                                |
| `EMA`  | 主图   | `periods` [12, 26]               | `ema12`、`ema26`                               |
| `SMMA` | 主图   | `periods` [7, 14]                | `smma7`、`smma14`：平滑移动平均（Wilder）      |
| `BOLL` | 主图   | `period` 20、`multiplier` 2      | `mid`、`upper`、`lower`                        |
| `VOL`  | 新子图 | `periods` [5, 10]                | `volume`（柱状）、`ma5`、`ma10`                |
| `MACD` | 新子图 | `fast` 12、`slow` 26、`signal` 9 | `dif`、`dea`、`macd`（柱状）                   |
| `RSI`  | 新子图 | `periods` [6, 12, 24]            | `rsi6`、`rsi12`、`rsi24`                       |
| `KDJ`  | 新子图 | `period` 9、`k` 3、`d` 3         | `k`、`d`、`j`                                  |
| `WR`   | 新子图 | `periods` [14, 28]               | `wr14`、`wr28`（最高价处为 0，最低价处为 100） |
| `CCI`  | 新子图 | `period` 14                      | `cci`                                          |
| `ROC`  | 新子图 | `period` 12                      | `roc`                                          |
| `BIAS` | 新子图 | `periods` [6, 12, 24]            | `bias6`、`bias12`、`bias24`                    |
| `OBV`  | 新子图 | —                                | `obv`                                          |
| `VR`   | 新子图 | `period` 24                      | `vr`                                           |
| `EMV`  | 新子图 | `period` 14、`signal` 9          | `emv`、`maemv`                                 |
| `MFI`  | 新子图 | `period` 14                      | `mfi`                                          |
| `ATR`  | 新子图 | `period` 14                      | `atr`                                          |
| `STD`  | 新子图 | `period` 20                      | `std`                                          |
| `DMI`  | 新子图 | `period` 14                      | `pdi`、`mdi`、`adx`、`adxr`                    |

`periods` 类参数最多接受 8 个值，每个值绘制一条线。

## 读取数值

```ts
chart.indicators.valuesAt(id); // 最新一根 K 线
chart.indicators.valuesAt(id, chart.crosshair.get()?.index ?? chart.data.length - 1);
// [{ key: 'dif', label: 'DIF', color: '#f5b942', value: 0.0293, text: '0.0293' }, …]
```

图表也会在每个子图的图例中显示这些值（`options.legend.visible`）。预警可以监控任意一项输出，参见[交易](trading.md#预警)。

## 自定义指标

先在图表上注册类型，然后像内置指标一样添加即可。最简单的形式是根据最近若干根 K 线算出每个值：

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

`compute()` 接收最近的 `lookback` 根 K 线（按从旧到新排列），并为每项输出返回一个数字（无值时返回 `NaN`）。窗口填满之后，每根 K 线调用一次。

对于取值依赖全部历史的指标（例如指数平均），请改为实现流式计算器。`next()` 每次处理一根 K 线；`clone()` 必须复制全部状态，因为图表会在最新一根 K 线之前保存一个检查点，每个 tick 只重放这一根 K 线。

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

### 定义参考

| 字段                                                               | 说明                                                                                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                             | 显示在图例中                                                                                                                                                          |
| `pane`                                                             | `'main'` 或 `'new'`：默认放置位置                                                                                                                                     |
| `params`                                                           | `{ key: { default, min?, max?, integer?, label? } }`；默认值为数组时即为列表参数                                                                                      |
| `outputs(params)`                                                  | `[{ key, label, plot, color? }]`，其中 `plot` 为 `{ kind: 'line', style? }`、`{ kind: 'histogram', colorBy: 'sign' \| 'change' \| 'bar' }`、`{ kind: 'hidden' }` 之一 |
| `levels?(params)`                                                  | 水平参考线                                                                                                                                                            |
| `fills?`                                                           | `[{ from, to }]`：在两项输出之间填充颜色                                                                                                                              |
| `precision`                                                        | 小数位数、`'price'`（跟随主序列）或 `'volume'`（紧凑格式，例如 `1.2M`）                                                                                               |
| `range?`                                                           | 该子图固定的坐标范围，例如 `{ min: 0, max: 100 }`                                                                                                                     |
| `create(params)` 或 `lookback(params)` + `compute(window, params)` | 计算逻辑                                                                                                                                                              |
