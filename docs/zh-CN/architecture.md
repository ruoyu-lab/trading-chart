# 架构

[English](../architecture.md) · **简体中文**

本页面向贡献者，介绍内核的组织方式，以及让它保持可维护的规则。

## 仓库结构

```
packages/core        @trading-chart-sdk/core，SDK 本体（无运行时依赖）
packages/vue         @trading-chart-sdk/vue，Vue 3 适配包
packages/react       @trading-chart-sdk/react，React 适配包
playground           Vue 演示应用和一个 React 页面，同时供端到端测试使用
e2e                  Playwright 测试（Chromium、Firefox、WebKit）
scripts              架构检查与包体积检查
docs                 文档
```

包之间通过 `@trading-chart-sdk/source` 导出条件解析彼此的源码，因此演示应用和测试无需构建，直接基于 `src` 运行。

## 分层

`packages/core/src` 中的模块只能导入同层或更低层的模块。`npm run check:architecture` 会强制执行这条规则，并拒绝运行时的循环导入。

| 层  | 模块                                  | 职责                                            |
| --- | ------------------------------------- | ----------------------------------------------- |
| 0   | `utils`                               | 错误、校验、合并、缓存、注册表                  |
| 1   | `events`、`data`、`options`、`canvas` | 事件总线、K 线存储、配置项与主题、画布辅助函数  |
| 2   | `format`、`scales`、`layout`          | 数字/日期格式化、时间与价格坐标、刻度、子图布局 |
| 3   | `panes`、`series`、`indicators`       | 子图存储、序列类型与渲染器、指标引擎            |
| 4   | `render`、`interaction`、`objects`    | 帧的构建与绘制、输入状态机、对象协调            |
| 5   | `drawings`、`trading`                 | 画线工具与编辑、委托单与标记                    |
| 6   | `alerts`                              | 预警计算与预警线                                |
| 7   | `chart`                               | `ChartCore`、公开 API 门面、状态                |

## 更新流程

所有变更都遵循同一条路径：

1. 公开 API 方法在 `core.run()` 内执行，事件派发会被推迟。
2. 方法修改模型（K 线、子图、指标、对象……），并调用 `invalidate()`（几何信息和所有图层）或 `invalidateLayers(...)`（部分图层）。
3. `FrameScheduler` 在下一个动画帧中统一绘制一次。如果几何信息已过期，绘制时会先构建**帧**（frame）：布局、可见 K 线、适配后的价格坐标、刻度，以及可直接用于渲染的点缓冲区。三个图层和所有坐标查询读取的都是同一帧。
4. 过程中产生的事件在操作完成后派发。

需要几何信息的查询（`timeToX`、`getVisibleRange` 等）在帧过期时会同步构建帧，但不进行绘制。

## 数据

`BarStore` 以 TypedArray 列存储 K 线。每次修改都会递增 `revision` 并记录变化的内容；使用方调用 `changesSince(theirRevision)`，得到 `null`、`{ kind: 'tail', from }` 或 `{ kind: 'reset' }`。这样所有派生结构（指标值、时间轴刻度）都能增量更新，而无需追踪对象引用。

## 技术指标

指标是一个流：`next(bar)` 返回它在一根 K 线上的输出。`IndicatorSeries` 按列存储这些输出，并保留一份最新 K 线之前的流的克隆。某个 tick 改变最新一根 K 线时，会恢复这份克隆并重放一根 K 线，因此每个指标的更新都是 O(1)。

## 渲染

三块画布叠放在一起：**scene**（网格、序列、指标、坐标轴）、**objects**（画线、委托单、预警、标记）和 **cursor**（十字光标、图例、最新价标签）。悬停时只重绘 cursor 层；拖动对象时重绘 objects 层。

序列渲染器接收已转换为像素的 `PointBuffer`。缓冲区归 `BufferPool` 所有，并在帧之间复用。

## 交互

`InputController` 把 DOM 输入转换为 `InteractionHost` 上的意图。手势构成一个小型状态机（`pressed`、`pan`、`drag`、`pinch`、坐标轴拖动、分隔线拖动、触屏十字光标、画线工具）。任何手势都可以被 `pointercancel`、`lostpointercapture`、窗口失焦或 Escape 取消；取消对象拖动时会还原该对象。悬停命中测试和滚轮缩放都会合并为每帧一次。

## 对象

画线、委托单、预警和标记都实现了 `ObjectDomain`：命中测试、绘制和拖动会话。`ObjectsController` 在所有域中选出最佳命中（按钮优先于控制点，控制点优先于标签，标签优先于线，线优先于主体；其次是已选中的对象，最后是距离最近的对象），并维护唯一的选中状态和悬停状态。

## 设计原则

- **API 调用从不触发事件。** 只有用户操作和预警才会。应用可以同步图表状态并回传给图表，而不会造成循环。
- **先校验，再修改。** 非法输入会在任何改变发生之前抛出指明该值的 `ChartError`。
- **不做静默回退。** 无法计算的值保持为空；不可能出现的状态直接抛出错误。
- **不保留兼容代码。** 每件事只有一种做法；API 的变更公开进行。
- **缓存有归属、有上限。** 每个缓存都属于某个图表实例，以修订号而非对象引用作为键，并且有大小限制。

## 质量门禁

`npm run verify` 会运行架构检查、ESLint（`strictTypeChecked`）、Prettier、TypeScript（strict、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）、单元测试、构建和包体积预算检查。CI 还会在三种浏览器中运行端到端测试。
