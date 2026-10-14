# API reference

[English](api.md) · [简体中文](zh-CN/api.md)

Everything is exported from `@trading-chart-sdk/core`. Types are named after what they describe: `XxxInput` is what you pass in, `Xxx` is what the chart returns.

- [createChart](#createchart)
- [Chart](#chart)
- [data](#data) · [timeScale](#timescale) · [priceScale](#pricescale) · [panes](#panes) · [series](#series) · [indicators](#indicators) · [drawings](#drawings) · [orders](#orders) · [markers](#markers) · [alerts](#alerts) · [crosshair](#crosshair)
- [Events](#events)
- [Options](#options)
- [Errors](#errors)

## Conventions

- **Time** (`TimeInput`) is epoch milliseconds, an ISO-8601 string or a `Date`. The chart always returns epoch milliseconds.
- **Coordinates** are CSS pixels relative to the chart's top-left corner.
- **Logical indices** count bars: bar `i` is centered on index `i`. Indices may be fractional or beyond the data.
- **Inputs are copied.** The chart never keeps or mutates objects you pass in.
- **API calls do not emit events.** Only user actions (and alerts) do.

## createChart

```ts
function createChart(container: HTMLElement, options?: ChartOptionsInput): Chart;
```

Creates a chart that fills `container`. Throws a [`ChartError`](#errors) if the container is invalid, a required browser API is missing, or an option is invalid.

## Chart

| Member                                           | Description                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `element: HTMLElement`                           | The element the chart created inside its container                        |
| `options(): ChartOptions`                        | The resolved options, frozen; change them with `applyOptions`             |
| `applyOptions(options: ChartOptionsInput): void` | Deep-merges option changes; arrays and functions are replaced             |
| `layout(): Layout`                               | Rectangles of panes, axes and separators, for positioning HTML overlays   |
| `resize(width, height): void`                    | Sets the size; with `autoSize` the container size wins on its next change |
| `batch(operation: () => void): void`             | Runs several calls and dispatches their events once afterwards            |
| `on(type, listener): Unsubscribe`                | Subscribes to an [event](#events)                                         |
| `select(selection: Selection \| null): void`     | Selects a drawing, order, alert or marker                                 |
| `selection(): Selection \| null`                 | The selected object                                                       |
| `saveState(): ChartState`                        | The user's layout: main series type, view, panes, indicators, drawings    |
| `loadState(state: ChartState): void`             | Restores a layout atomically; invalid states throw and change nothing     |
| `screenshot(): HTMLCanvasElement`                | Renders pending changes and returns a canvas of the whole chart           |
| `destroy(): void`                                | Removes the element and releases all resources                            |

```ts
interface Selection {
  kind: 'drawing' | 'order' | 'alert' | 'marker';
  id: string;
}
```

## data

The main OHLCV series.

| Member                                               | Description                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `set(bars: readonly BarInput[]): void`               | Replaces all bars. Times must be strictly ascending                                        |
| `update(bar: BarInput \| readonly BarInput[]): void` | Replaces the last bar (same time) or appends newer bars. Rejects older bars                |
| `prepend(bars: readonly BarInput[]): number`         | Inserts older bars; ignores bars at or after the first bar; returns how many were inserted |
| `clear(): void`                                      | Removes all bars                                                                           |
| `length: number`                                     | Number of bars                                                                             |
| `at(index: number): Bar \| null`                     | The bar at an index                                                                        |
| `last(): Bar \| null`                                | The latest bar                                                                             |
| `indexOf(time: TimeInput): number`                   | Index of the bar with exactly this time, or `-1`                                           |
| `toArray(): Bar[]`                                   | A copy of all bars                                                                         |

```ts
interface BarInput {
  time: TimeInput;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // default 0
}
```

## timeScale

| Member                                                            | Description                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `getVisibleRange(): TimeRange \| null`                            | Times of the first and last visible bars                        |
| `setVisibleRange({ from, to }): void`                             | Shows the bars between two times                                |
| `getVisibleLogicalRange(): LogicalRange \| null`                  | Logical indices at the plot edges                               |
| `setVisibleLogicalRange(range: LogicalRange): void`               | Shows a logical index range                                     |
| `scrollToTime(time, align?: 'left' \| 'center' \| 'right'): void` | Default `center`                                                |
| `scrollToIndex(index, align?): void`                              |                                                                 |
| `scrollToRealTime(): void`                                        | Back to the latest bar at the configured right offset           |
| `isFollowing(): boolean`                                          | Whether the latest bar is in view, so new bars scroll into view |
| `fitContent(): void`                                              | Shows every bar                                                 |
| `zoomIn(): void` / `zoomOut(): void`                              | Zooms by one step, keeping the latest bar in place when visible |
| `getBarSpacing(): number` / `setBarSpacing(px): void`             | Distance between bars                                           |
| `reset(): void`                                                   | Configured bar spacing and the real-time position               |
| `timeToX(time): number \| null` / `xToTime(x): number \| null`    | Interpolated between bars, extrapolated beyond them             |
| `indexToX(index): number \| null` / `xToIndex(x): number \| null` |                                                                 |

## priceScale

```ts
chart.priceScale(paneId = 'main'): PriceScaleApi
```

| Member                                                            | Description                                                                                                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getRange(): PriceRange \| null`                                  | Visible value range                                                                                                                                                                 |
| `setRange({ min, max }): void`                                    | Fixes the range and turns auto-scaling off                                                                                                                                          |
| `autoScale(): void` / `isAutoScale(): boolean`                    | Auto-scaling fits the visible data. Dragging or wheel-zooming the price axis turns it off (the plot can then also be dragged vertically); double-clicking the axis turns it back on |
| `getMode(): PriceScaleMode` / `setMode(mode): void`               | `'normal' \| 'log' \| 'percent' \| 'indexed'`                                                                                                                                       |
| `isInverted(): boolean` / `setInverted(inverted): void`           | Higher values at the bottom                                                                                                                                                         |
| `priceToY(price): number \| null` / `yToPrice(y): number \| null` | Chart coordinates                                                                                                                                                                   |

Percent and indexed modes measure against the first visible value of the pane. While that base is unusable (zero, or negative for indexed mode) and while a logarithmic pane has no positive values, the pane is drawn in normal mode.

## panes

The main pane (`'main'`) is always first and takes the space the other panes leave. Indicators and series placed in `'new'` get a pane of their own, which is removed with its last occupant.

| Member                                  | Description                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `list(): Pane[]`                        | Panes from top to bottom                                                         |
| `get(id): Pane \| null`                 |                                                                                  |
| `add({ id, title?, height? }): void`    | Adds an empty pane at the bottom                                                 |
| `update(id, { title?, height? }): void` |                                                                                  |
| `remove(id): void`                      | Removes a pane and its drawings; its indicators and series must be removed first |
| `move(id, index): void`                 | Reorders panes; the main pane stays at index 0                                   |

## series

Additional series aligned to the main bars by time, such as a comparison symbol.

| Member                                                                            | Description                             |
| --------------------------------------------------------------------------------- | --------------------------------------- |
| `add(series: SeriesInput): string`                                                | Returns the id                          |
| `update(id, { title?, visible?, style? }): void`                                  |                                         |
| `remove(id): void`                                                                | Fails while an alert reads the series   |
| `get(id) / list()`                                                                |                                         |
| `setData(id, points) / updateData(id, point \| points) / prependData(id, points)` | Same rules as `data`                    |
| `registerType(type, definition: SeriesTypeDefinition): void`                      | Adds a custom series type to this chart |
| `types(): string[]`                                                               | Available types                         |

```ts
interface SeriesInput {
  id?: string;
  type: string; // 'line', 'area', 'columns', 'candles', …
  pane?: string; // 'main' (default), 'new' or a pane id
  title?: string;
  visible?: boolean;
  style?: Record<string, unknown>; // overrides of the type's style
  data?: Array<{ time: TimeInput; value: number | null } | BarInput>;
}
```

Built-in types: `candles`, `hollow-candles`, `ohlc`, `high-low`, `hlc-area` (OHLC points) and `line`, `step-line`, `line-markers`, `area`, `baseline`, `columns` (value points). Their style properties are listed by `SeriesStyleMap`; the main series uses the same types through `options.mainSeries`.

## indicators

| Member                                                      | Description                                     |
| ----------------------------------------------------------- | ----------------------------------------------- |
| `add(indicator: IndicatorInput): string`                    | Returns the id                                  |
| `update(id, { params?, source?, visible?, colors? }): void` |                                                 |
| `remove(id): void`                                          | Fails while an alert reads the indicator        |
| `get(id) / list()`                                          |                                                 |
| `valuesAt(id, index?): IndicatorValue[]`                    | Formatted values at a bar (default: the latest) |
| `register(type, definition: IndicatorDefinition): void`     | Adds a custom indicator type to this chart      |
| `types(): string[]`                                         | Available types                                 |

See [Indicators](indicators.md).

## drawings

| Member                                                                  | Description                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| `set(drawings: readonly DrawingInput[]): void`                          | Replaces every drawing and clears the undo history |
| `add(drawing): string` / `update(id, patch)` / `remove(id)` / `clear()` | Undoable steps                                     |
| `get(id) / list()`                                                      |                                                    |
| `startTool(type, { style?, text? }?): void`                             | Lets the user place a drawing                      |
| `cancelTool(): void` / `activeTool(): string \| null`                   |                                                    |
| `undo() / redo(): boolean` / `canUndo() / canRedo(): boolean`           |                                                    |
| `registerType(type, definition: DrawingTypeDefinition): void`           | Adds a custom drawing type                         |
| `types(): string[]`                                                     | Available types                                    |

See [Drawings](drawings.md).

## orders

| Member                                                      | Description |
| ----------------------------------------------------------- | ----------- |
| `set(orders) / add(order) / update(id, patch) / remove(id)` |             |
| `get(id) / list()`                                          |             |

## markers

| Member                                                        | Description |
| ------------------------------------------------------------- | ----------- |
| `set(markers) / add(marker) / update(id, patch) / remove(id)` |             |
| `get(id) / list()`                                            |             |

## alerts

| Member                                                      | Description                                          |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| `set(alerts) / add(alert) / update(id, patch) / remove(id)` |                                                      |
| `get(id) / list()`                                          | Includes `status` and `triggeredAt`                  |
| `rearm(id): void`                                           | Arms an alert that fired with frequency `once` again |

Orders, markers and alerts are described in [Trading](trading.md).

## crosshair

| Member                               | Description                                                         |
| ------------------------------------ | ------------------------------------------------------------------- |
| `get(): CrosshairState \| null`      | Where the crosshair is                                              |
| `set({ time, price?, pane? }): void` | Shows the crosshair without a pointer, e.g. to mirror another chart |
| `clear(): void`                      |                                                                     |

```ts
interface CrosshairState {
  x: number;
  y: number;
  paneId: string | null; // null over the time axis
  index: number; // logical index, may lie beyond the data
  time: number | null;
  price: number | null; // value at y in the pane's scale
  bar: Bar | null; // the hovered bar
}
```

## Events

`chart.on(type, listener)` returns a function that unsubscribes. Listeners run after the operation that caused the event; errors thrown by listeners are rethrown after all listeners ran.

| Event                     | Payload                                                      | When                                                          |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `crosshairMove`           | `{ visible: true, ...CrosshairState } \| { visible: false }` | The pointer moves over the chart or leaves it                 |
| `click` / `doubleClick`   | `ChartPointerEvent`                                          | Includes the clicked `target` object, if any                  |
| `contextMenu`             | `ChartPointerEvent`                                          | Listening suppresses the browser menu                         |
| `visibleRangeChange`      | `{ range, logicalRange }`                                    | The visible bars change, for any reason                       |
| `loadMore`                | `{ before }`                                                 | Fewer than `loadMoreThreshold` bars remain hidden on the left |
| `selectionChange`         | `{ selection }`                                              | The user selects or deselects an object                       |
| `paneResize`              | `{ paneId, height }`                                         | The user finished dragging a pane separator                   |
| `drawingsChange`          | `{ reason, ids }`                                            | The user created, edited, removed, undid or redid drawings    |
| `toolChange`              | `{ tool: null }`                                             | The drawing tool ended (finished or cancelled by the user)    |
| `orderDrag` / `alertDrag` | `{ id, phase, price, initialPrice }`                         | `phase` is `start`, `move`, `end` or `cancel`                 |
| `buttonClick`             | `{ kind, id, buttonId }`                                     | A label button of an order or alert was clicked               |
| `alertTrigger`            | `{ id, time, value, threshold, trigger }`                    | An alert condition was met                                    |

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

## Options

Defaults in parentheses.

| Option                                                                                                              | Description                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `autoSize` (`true`)                                                                                                 | Follow the container size                                                                |
| `locale` (runtime default)                                                                                          | BCP 47 locale for numbers and dates                                                      |
| `timeZone` (local)                                                                                                  | IANA time zone, e.g. `Asia/Shanghai`                                                     |
| `theme` (`darkTheme`)                                                                                               | Colors; `lightTheme` is exported too                                                     |
| `font.family`, `font.size` (`12`)                                                                                   | Text of axes, legends and labels                                                         |
| `grid.vertical`, `grid.horizontal` (`true`), `grid.style` (`solid`)                                                 |                                                                                          |
| `crosshair.mode` (`free`)                                                                                           | `free` follows the pointer, `magnet` snaps to the close of the hovered bar               |
| `crosshair.vertical`, `crosshair.horizontal`, `crosshair.labels` (`true`), `crosshair.style` (`dashed`)             |                                                                                          |
| `mainSeries.type` (`candles`)                                                                                       | Any series type                                                                          |
| `mainSeries.source` (`close`)                                                                                       | Price plotted by line-like types: `open`, `high`, `low`, `close`, `hl2`, `hlc3`, `ohlc4` |
| `mainSeries.styles` (`{}`)                                                                                          | Style overrides per type, e.g. `{ candles: { upColor: '#0f0' } }`                        |
| `timeScale.visible` (`true`), `timeScale.height` (`28`)                                                             |                                                                                          |
| `timeScale.barSpacing` (`8`), `minBarSpacing` (`0.5`), `maxBarSpacing` (`60`)                                       | Pixels per bar                                                                           |
| `timeScale.rightOffset` (`60`)                                                                                      | Space after the latest bar at the real-time position                                     |
| `timeScale.loadMoreThreshold` (`20`)                                                                                | Bars hidden on the left that trigger `loadMore`                                          |
| `timeScale.formatter` (`null`)                                                                                      | `(time, { kind, unit, locale, timeZone }) => string`                                     |
| `priceScale.visible` (`true`), `priceScale.minWidth` (`48`)                                                         |                                                                                          |
| `priceScale.margins` (`{ top: 0.1, bottom: 0.08 }`)                                                                 | Space around auto-scaled data, as a fraction of the pane                                 |
| `priceScale.precision` (`'auto'`)                                                                                   | Decimals of prices; `auto` infers them from the data                                     |
| `priceScale.formatter` (`null`)                                                                                     | `(value, { paneId, mode, precision, locale }) => string`                                 |
| `latestPrice.line`, `latestPrice.label` (`true`), `latestPrice.countdown` (`false`), `latestPrice.style` (`dotted`) |                                                                                          |
| `legend.visible` (`true`)                                                                                           | OHLC and indicator values at the top of each pane                                        |
| `interaction.pan`, `wheelZoom`, `pinchZoom`, `axisScale`, `kineticScroll`, `keyboard` (`true`)                      |                                                                                          |
| `interaction.longPressMs` (`300`)                                                                                   | Touch press that shows the crosshair                                                     |
| `panes.defaultHeight` (`120`), `panes.minHeight` (`40`), `panes.separatorHeight` (`5`)                              |                                                                                          |
| `drawings.magnet` (`false`)                                                                                         | Snap anchors to OHLC values                                                              |
| `drawings.hitTolerance` (`6`), `drawings.handleRadius` (`4.5`)                                                      |                                                                                          |
| `performance.maxPixelRatio` (`3`)                                                                                   | Caps the canvas resolution                                                               |

### Keyboard

With `interaction.keyboard`, while the chart has focus: arrows scroll and zoom, `End` returns to real time, `Escape` cancels a drag or the drawing tool and clears the selection, `Delete` removes the selected drawing, `Ctrl/⌘ + Z` undoes and `Ctrl/⌘ + Shift + Z` or `Ctrl + Y` redoes.

## Errors

Every invalid argument, unknown id or illegal call throws a `ChartError` (exported) whose message names the offending value, for example:

```
[trading-chart] bars[3] (time 1714642260000) is older than the last bar (time 1714642320000). update() only replaces the last bar or appends newer ones; use set() or prepend() to change history.
```

Operations validate before they change anything, so a thrown error leaves the chart as it was.
