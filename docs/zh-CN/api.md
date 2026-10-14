# API 参考

[English](../api.md) · **简体中文**

所有内容都从 `@trading-chart-sdk/core` 导出。类型按其描述的对象命名：`XxxInput` 是你传入的数据，`Xxx` 是图表返回的数据。

- [createChart](#createchart)
- [Chart](#chart)
- [data](#data) · [timeScale](#timescale) · [priceScale](#pricescale) · [panes](#panes) · [series](#series) · [indicators](#indicators) · [drawings](#drawings) · [orders](#orders) · [markers](#markers) · [alerts](#alerts) · [crosshair](#crosshair)
- [事件](#事件)
- [配置项](#配置项)
- [错误](#错误)

## 约定

- **时间**（`TimeInput`）可以是毫秒时间戳、ISO-8601 字符串或 `Date`。图表返回的始终是毫秒时间戳。
- **坐标**是相对于图表左上角的 CSS 像素。
- **逻辑索引**以 K 线计数：第 `i` 根 K 线的中心位于索引 `i`。索引可以是小数，也可以超出数据范围。
- **输入会被复制。** 图表从不保留或修改你传入的对象。
- **API 调用不会触发事件。** 只有用户操作（以及预警）才会。

## createChart

```ts
function createChart(container: HTMLElement, options?: ChartOptionsInput): Chart;
```

创建一个填满 `container` 的图表。容器无效、缺少必需的浏览器 API 或配置项非法时，抛出 [`ChartError`](#错误)。

## Chart

| 成员                                             | 说明                                                         |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `element: HTMLElement`                           | 图表在容器内创建的元素                                       |
| `options(): ChartOptions`                        | 解析后的配置项（已冻结，请用 `applyOptions` 修改）           |
| `applyOptions(options: ChartOptionsInput): void` | 深度合并配置项的修改；数组和函数会被整体替换                 |
| `layout(): Layout`                               | 子图、坐标轴和分隔线的矩形区域，用于定位 HTML 浮层           |
| `resize(width, height): void`                    | 设置尺寸；开启 `autoSize` 时，容器下一次尺寸变化会覆盖该尺寸 |
| `batch(operation: () => void): void`             | 执行多个调用，并在之后统一派发一次事件                       |
| `on(type, listener): Unsubscribe`                | 订阅[事件](#事件)                                            |
| `select(selection: Selection \| null): void`     | 选中画线、委托单、预警或标记                                 |
| `selection(): Selection \| null`                 | 当前选中的对象                                               |
| `saveState(): ChartState`                        | 用户布局：主序列类型、视图、子图、指标、画线                 |
| `loadState(state: ChartState): void`             | 以原子方式恢复布局；状态不合法时抛出错误，不做任何改变       |
| `screenshot(): HTMLCanvasElement`                | 渲染尚未绘制的变更，并返回包含整个图表的画布                 |
| `destroy(): void`                                | 移除元素并释放所有资源                                       |

```ts
interface Selection {
  kind: 'drawing' | 'order' | 'alert' | 'marker';
  id: string;
}
```

## data

主 OHLCV 序列。

| 成员                                                 | 说明                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `set(bars: readonly BarInput[]): void`               | 替换全部 K 线。时间必须严格递增                                          |
| `update(bar: BarInput \| readonly BarInput[]): void` | 替换最后一根 K 线（时间相同）或追加更新的 K 线。拒绝更早的 K 线          |
| `prepend(bars: readonly BarInput[]): number`         | 插入更早的 K 线；忽略时间等于或晚于第一根 K 线的数据；返回实际插入的数量 |
| `clear(): void`                                      | 移除全部 K 线                                                            |
| `length: number`                                     | K 线数量                                                                 |
| `at(index: number): Bar \| null`                     | 指定索引处的 K 线                                                        |
| `last(): Bar \| null`                                | 最新一根 K 线                                                            |
| `indexOf(time: TimeInput): number`                   | 时间完全一致的 K 线的索引，没有则返回 `-1`                               |
| `toArray(): Bar[]`                                   | 全部 K 线的副本                                                          |

```ts
interface BarInput {
  time: TimeInput;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // 默认 0
}
```

## timeScale

| 成员                                                              | 说明                                               |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `getVisibleRange(): TimeRange \| null`                            | 第一根和最后一根可见 K 线的时间                    |
| `setVisibleRange({ from, to }): void`                             | 显示两个时间之间的 K 线                            |
| `getVisibleLogicalRange(): LogicalRange \| null`                  | 绘图区左右边缘处的逻辑索引                         |
| `setVisibleLogicalRange(range: LogicalRange): void`               | 显示一段逻辑索引范围                               |
| `scrollToTime(time, align?: 'left' \| 'center' \| 'right'): void` | 默认 `center`                                      |
| `scrollToIndex(index, align?): void`                              |                                                    |
| `scrollToRealTime(): void`                                        | 回到最新 K 线，右侧保留配置的留白                  |
| `isFollowing(): boolean`                                          | 最新 K 线是否在视图内，即新 K 线是否会自动滚入视图 |
| `fitContent(): void`                                              | 显示全部 K 线                                      |
| `zoomIn(): void` / `zoomOut(): void`                              | 缩放一级；最新 K 线可见时保持其位置不变            |
| `getBarSpacing(): number` / `setBarSpacing(px): void`             | K 线间距                                           |
| `reset(): void`                                                   | 恢复配置的 K 线间距和实时位置                      |
| `timeToX(time): number \| null` / `xToTime(x): number \| null`    | 在 K 线之间插值，超出 K 线范围时外推               |
| `indexToX(index): number \| null` / `xToIndex(x): number \| null` |                                                    |

## priceScale

```ts
chart.priceScale(paneId = 'main'): PriceScaleApi
```

| 成员                                                              | 说明                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `getRange(): PriceRange \| null`                                  | 可见的数值范围                                                                                                               |
| `setRange({ min, max }): void`                                    | 固定范围并关闭自动缩放                                                                                                       |
| `autoScale(): void` / `isAutoScale(): boolean`                    | 自动缩放让坐标适配可见数据。拖动价格坐标或在其上滚动滚轮缩放会关闭自动缩放（此时绘图区也可以上下拖动）；双击坐标轴可重新开启 |
| `getMode(): PriceScaleMode` / `setMode(mode): void`               | `'normal' \| 'log' \| 'percent' \| 'indexed'`                                                                                |
| `isInverted(): boolean` / `setInverted(inverted): void`           | 较大的值显示在下方                                                                                                           |
| `priceToY(price): number \| null` / `yToPrice(y): number \| null` | 图表坐标                                                                                                                     |

百分比和指数化模式以该子图第一个可见值为基准。当基准不可用（为零，或在指数化模式下为负数）时，以及对数坐标的子图中没有正值时，该子图按普通模式绘制。

## panes

主图（`'main'`）始终位于最上方，占据其他子图剩下的空间。放到 `'new'` 中的指标和序列会获得独立的子图，最后一个占用者移除时，该子图也随之移除。

| 成员                                    | 说明                                               |
| --------------------------------------- | -------------------------------------------------- |
| `list(): Pane[]`                        | 从上到下排列的子图                                 |
| `get(id): Pane \| null`                 |                                                    |
| `add({ id, title?, height? }): void`    | 在底部添加一个空子图                               |
| `update(id, { title?, height? }): void` |                                                    |
| `remove(id): void`                      | 移除子图及其中的画线；其中的指标和序列必须先行移除 |
| `move(id, index): void`                 | 调整子图顺序；主图始终位于索引 0                   |

## series

按时间与主 K 线对齐的附加序列，例如对比品种。

| 成员                                                                              | 说明                       |
| --------------------------------------------------------------------------------- | -------------------------- |
| `add(series: SeriesInput): string`                                                | 返回 id                    |
| `update(id, { title?, visible?, style? }): void`                                  |                            |
| `remove(id): void`                                                                | 有预警读取该序列时会失败   |
| `get(id) / list()`                                                                |                            |
| `setData(id, points) / updateData(id, point \| points) / prependData(id, points)` | 规则与 `data` 相同         |
| `registerType(type, definition: SeriesTypeDefinition): void`                      | 为此图表添加自定义序列类型 |
| `types(): string[]`                                                               | 可用的类型                 |

```ts
interface SeriesInput {
  id?: string;
  type: string; // 'line', 'area', 'columns', 'candles', …
  pane?: string; // 'main'（默认）、'new' 或某个子图的 id
  title?: string;
  visible?: boolean;
  style?: Record<string, unknown>; // 覆盖该类型的样式
  data?: Array<{ time: TimeInput; value: number | null } | BarInput>;
}
```

内置类型：`candles`、`hollow-candles`、`ohlc`、`high-low`、`hlc-area`（OHLC 数据点），以及 `line`、`step-line`、`line-markers`、`area`、`baseline`、`columns`（数值数据点）。它们的样式属性见 `SeriesStyleMap`；主序列通过 `options.mainSeries` 使用同一套类型。

## indicators

| 成员                                                        | 说明                                      |
| ----------------------------------------------------------- | ----------------------------------------- |
| `add(indicator: IndicatorInput): string`                    | 返回 id                                   |
| `update(id, { params?, source?, visible?, colors? }): void` |                                           |
| `remove(id): void`                                          | 有预警读取该指标时会失败                  |
| `get(id) / list()`                                          |                                           |
| `valuesAt(id, index?): IndicatorValue[]`                    | 某根 K 线上格式化后的值（默认为最新一根） |
| `register(type, definition: IndicatorDefinition): void`     | 为此图表添加自定义指标类型                |
| `types(): string[]`                                         | 可用的类型                                |

参见[技术指标](indicators.md)。

## drawings

| 成员                                                                    | 说明                       |
| ----------------------------------------------------------------------- | -------------------------- |
| `set(drawings: readonly DrawingInput[]): void`                          | 替换全部画线并清空撤销历史 |
| `add(drawing): string` / `update(id, patch)` / `remove(id)` / `clear()` | 可撤销的操作               |
| `get(id) / list()`                                                      |                            |
| `startTool(type, { style?, text? }?): void`                             | 让用户放置一条画线         |
| `cancelTool(): void` / `activeTool(): string \| null`                   |                            |
| `undo() / redo(): boolean` / `canUndo() / canRedo(): boolean`           |                            |
| `registerType(type, definition: DrawingTypeDefinition): void`           | 添加自定义画线类型         |
| `types(): string[]`                                                     | 可用的类型                 |

参见[画线工具](drawings.md)。

## orders

| 成员                                                        | 说明 |
| ----------------------------------------------------------- | ---- |
| `set(orders) / add(order) / update(id, patch) / remove(id)` |      |
| `get(id) / list()`                                          |      |

## markers

| 成员                                                          | 说明 |
| ------------------------------------------------------------- | ---- |
| `set(markers) / add(marker) / update(id, patch) / remove(id)` |      |
| `get(id) / list()`                                            |      |

## alerts

| 成员                                                        | 说明                               |
| ----------------------------------------------------------- | ---------------------------------- |
| `set(alerts) / add(alert) / update(id, patch) / remove(id)` |                                    |
| `get(id) / list()`                                          | 包含 `status` 和 `triggeredAt`     |
| `rearm(id): void`                                           | 重新启用以 `once` 频率触发过的预警 |

委托单、标记和预警的说明见[交易](trading.md)。

## crosshair

| 成员                                 | 说明                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| `get(): CrosshairState \| null`      | 十字光标所在的位置                                   |
| `set({ time, price?, pane? }): void` | 在没有指针的情况下显示十字光标，例如与另一个图表联动 |
| `clear(): void`                      |                                                      |

```ts
interface CrosshairState {
  x: number;
  y: number;
  paneId: string | null; // 位于时间轴上时为 null
  index: number; // 逻辑索引，可能超出数据范围
  time: number | null;
  price: number | null; // y 处在该子图坐标中对应的数值
  bar: Bar | null; // 悬停处的 K 线
}
```

## 事件

`chart.on(type, listener)` 返回一个用于取消订阅的函数。监听器在引发事件的操作完成之后运行；监听器抛出的错误会在所有监听器都运行完毕后重新抛出。

| 事件                      | 载荷                                                         | 触发时机                                      |
| ------------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| `crosshairMove`           | `{ visible: true, ...CrosshairState } \| { visible: false }` | 指针在图表上移动或离开图表                    |
| `click` / `doubleClick`   | `ChartPointerEvent`                                          | 包含被点击的 `target` 对象（如果有）          |
| `contextMenu`             | `ChartPointerEvent`                                          | 注册监听后会屏蔽浏览器的右键菜单              |
| `visibleRangeChange`      | `{ range, logicalRange }`                                    | 可见的 K 线发生变化，无论原因                 |
| `loadMore`                | `{ before }`                                                 | 左侧隐藏的 K 线少于 `loadMoreThreshold` 根    |
| `selectionChange`         | `{ selection }`                                              | 用户选中或取消选中对象                        |
| `paneResize`              | `{ paneId, height }`                                         | 用户拖动子图分隔线结束                        |
| `drawingsChange`          | `{ reason, ids }`                                            | 用户创建、编辑、删除、撤销或重做了画线        |
| `toolChange`              | `{ tool: null }`                                             | 画线工具结束（画完或被用户取消）              |
| `orderDrag` / `alertDrag` | `{ id, phase, price, initialPrice }`                         | `phase` 为 `start`、`move`、`end` 或 `cancel` |
| `buttonClick`             | `{ kind, id, buttonId }`                                     | 委托单或预警的标签按钮被点击                  |
| `alertTrigger`            | `{ id, time, value, threshold, trigger }`                    | 满足预警条件                                  |

```ts
interface ChartPointerEvent {
  x: number;
  y: number;
  paneId: string | null;
  index: number | null;
  time: number | null;
  price: number | null;
  target: { kind: 'drawing' | 'order' | 'alert' | 'marker'; id: string; part: string } | null;
}
```

## 配置项

括号内为默认值。

| 配置项                                                                                                                 | 说明                                                                         |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `autoSize`（`true`）                                                                                                   | 跟随容器尺寸                                                                 |
| `locale`（运行环境的默认值）                                                                                           | 用于数字和日期的 BCP 47 语言标签                                             |
| `timeZone`（本地时区）                                                                                                 | IANA 时区，例如 `Asia/Shanghai`                                              |
| `theme`（`darkTheme`）                                                                                                 | 颜色；同时也导出了 `lightTheme`                                              |
| `font.family`、`font.size`（`12`）                                                                                     | 坐标轴、图例和标签的文字                                                     |
| `grid.vertical`、`grid.horizontal`（`true`），`grid.style`（`solid`）                                                  |                                                                              |
| `crosshair.mode`（`magnet`）                                                                                           | `magnet` 吸附到悬停 K 线的收盘价，`free` 跟随指针                            |
| `crosshair.vertical`、`crosshair.horizontal`、`crosshair.labels`（`true`），`crosshair.style`（`dashed`）              |                                                                              |
| `mainSeries.type`（`candles`）                                                                                         | 任意序列类型                                                                 |
| `mainSeries.source`（`close`）                                                                                         | 线类图形所绘制的价格：`open`、`high`、`low`、`close`、`hl2`、`hlc3`、`ohlc4` |
| `mainSeries.styles`（`{}`）                                                                                            | 按类型覆盖样式，例如 `{ candles: { upColor: '#0f0' } }`                      |
| `timeScale.visible`（`true`），`timeScale.height`（`28`）                                                              |                                                                              |
| `timeScale.barSpacing`（`8`），`minBarSpacing`（`0.5`），`maxBarSpacing`（`60`）                                       | 每根 K 线占用的像素                                                          |
| `timeScale.rightOffset`（`60`）                                                                                        | 位于实时位置时，最新 K 线右侧的留白                                          |
| `timeScale.loadMoreThreshold`（`20`）                                                                                  | 左侧隐藏的 K 线少于该数量时触发 `loadMore`                                   |
| `timeScale.formatter`（`null`）                                                                                        | `(time, { kind, unit, locale, timeZone }) => string`                         |
| `priceScale.visible`（`true`），`priceScale.minWidth`（`48`）                                                          |                                                                              |
| `priceScale.margins`（`{ top: 0.1, bottom: 0.08 }`）                                                                   | 自动缩放时数据上下的留白，以子图高度的比例表示                               |
| `priceScale.precision`（`'auto'`）                                                                                     | 价格的小数位数；`auto` 表示根据数据推断                                      |
| `priceScale.formatter`（`null`）                                                                                       | `(value, { paneId, mode, precision, locale }) => string`                     |
| `latestPrice.line`、`latestPrice.label`（`true`），`latestPrice.countdown`（`false`），`latestPrice.style`（`dotted`） |                                                                              |
| `legend.visible`（`true`）                                                                                             | 在每个子图顶部显示 OHLC 和指标数值                                           |
| `interaction.pan`、`wheelZoom`、`pinchZoom`、`axisScale`、`kineticScroll`、`keyboard`（`true`）                        |                                                                              |
| `interaction.longPressMs`（`300`）                                                                                     | 触屏长按多久后显示十字光标                                                   |
| `panes.defaultHeight`（`120`），`panes.minHeight`（`40`），`panes.separatorHeight`（`5`）                              |                                                                              |
| `drawings.magnet`（`false`）                                                                                           | 将锚点吸附到 OHLC 价格                                                       |
| `drawings.hitTolerance`（`6`），`drawings.handleRadius`（`4.5`）                                                       |                                                                              |
| `performance.maxPixelRatio`（`3`）                                                                                     | 限制画布分辨率的上限                                                         |

### 键盘快捷键

启用 `interaction.keyboard` 后，在图表获得焦点时：方向键用于滚动和缩放，`End` 回到实时位置，`Escape` 取消拖动或画线工具并清除选中，`Delete` 删除选中的画线，`Ctrl/⌘ + Z` 撤销，`Ctrl/⌘ + Shift + Z` 或 `Ctrl + Y` 重做。

## 错误

所有非法参数、未知 id 或不合法的调用都会抛出 `ChartError`（已导出），错误消息会指出出错的值，例如：

```
[trading-chart] bars[3] (time 1714642260000) is older than the last bar (time 1714642320000). update() only replaces the last bar or appends newer ones; use set() or prepend() to change history.
```

所有操作都会先校验再修改，因此抛出错误时图表保持原样。
