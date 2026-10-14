# Architecture

[English](architecture.md) · [简体中文](zh-CN/architecture.md)

This page is for contributors. It explains how the core is organized and the rules that keep it maintainable.

## Repository

```
packages/core        @trading-chart-sdk/core, the SDK (no runtime dependencies)
packages/vue         @trading-chart-sdk/vue, the Vue 3 adapter
packages/react       @trading-chart-sdk/react, the React adapter
playground           Vue demo app and a React page, also used by the end-to-end tests
e2e                  Playwright tests (Chromium, Firefox, WebKit)
scripts              architecture and bundle-size checks
docs                 documentation
```

Packages resolve each other's sources through the `@trading-chart-sdk/source` export condition, so the playground and the tests run against `src` without a build.

## Layers

Modules of `packages/core/src` may import modules of their own or a lower layer. `npm run check:architecture` enforces this and rejects runtime import cycles.

| Layer | Modules                               | Responsibility                                                        |
| ----- | ------------------------------------- | --------------------------------------------------------------------- |
| 0     | `utils`                               | Errors, validation, merging, caches, registries                       |
| 1     | `events`, `data`, `options`, `canvas` | Event bus, bar storage, options and themes, canvas helpers            |
| 2     | `format`, `scales`, `layout`          | Number/date formatting, time and price scales, ticks, pane layout     |
| 3     | `panes`, `series`, `indicators`       | Pane store, series types and renderers, indicator engine              |
| 4     | `render`, `interaction`, `objects`    | Frame building and painting, input state machine, object coordination |
| 5     | `drawings`, `trading`                 | Drawing tools and editing, orders and markers                         |
| 6     | `alerts`                              | Alert evaluation and lines                                            |
| 7     | `chart`                               | `ChartCore`, the public API facades, state                            |

## Update path

Every change follows one path:

1. A public API method runs inside `core.run()`, which defers event dispatch.
2. It mutates a model (bars, panes, indicators, objects…) and calls `invalidate()` (geometry and all layers) or `invalidateLayers(...)` (some layers).
3. The `FrameScheduler` paints once in the next animation frame. Painting first builds the **frame** if the geometry is stale: layout, visible bars, fitted price scales, ticks and render-ready point buffers. All three layers and every coordinate query read the same frame.
4. Events emitted along the way are dispatched after the operation completes.

Queries that need geometry (`timeToX`, `getVisibleRange`, …) build the frame synchronously when it is stale, without painting.

## Data

`BarStore` keeps bars in typed-array columns. Each mutation increases `revision` and records what changed; consumers call `changesSince(theirRevision)` and get `null`, `{ kind: 'tail', from }` or `{ kind: 'reset' }`. This lets every derived structure (indicator values, time-axis marks) update incrementally without tracking object identity.

## Indicators

An indicator is a stream: `next(bar)` returns its outputs for one bar. `IndicatorSeries` stores the outputs in columns and keeps a clone of the stream from before the latest bar. A tick that changes the latest bar restores the clone and replays one bar, so every indicator updates in O(1).

## Rendering

Three canvases are stacked: **scene** (grid, series, indicators, axes), **objects** (drawings, orders, alerts, markers) and **cursor** (crosshair, legends, latest-price label). Hovering repaints only the cursor layer; dragging an object repaints the objects layer.

Series renderers receive a `PointBuffer` already converted to pixels. Buffers are owned by a `BufferPool` and reused between frames.

## Interaction

`InputController` turns DOM input into intents on an `InteractionHost`. Gestures form a small state machine (`pressed`, `pan`, `drag`, `pinch`, axis drags, separator, touch crosshair, tool). Every gesture can be cancelled by `pointercancel`, `lostpointercapture`, window blur or Escape; cancelling an object drag restores the object. Hover hit tests and wheel zoom are coalesced to one per frame.

## Objects

Drawings, orders, alerts and markers implement `ObjectDomain`: hit testing, painting and drag sessions. `ObjectsController` picks the best hit across domains (buttons over handles over labels over lines over bodies, then the selected object, then the closest), and keeps the single selection and hover state.

## Principles

- **API calls never emit events.** Only user actions and alerts do. Applications can mirror chart state and feed it back without loops.
- **Validate, then mutate.** Invalid input throws a `ChartError` that names the value before anything changes.
- **No silent fallbacks.** Values that cannot be computed stay empty; impossible states throw.
- **No compatibility code.** There is one way to do each thing; the API changes in the open.
- **Caches are owned and bounded.** Every cache belongs to a chart instance, is keyed by revisions rather than object identity, and has a size limit.

## Quality gates

`npm run verify` runs the architecture check, ESLint (`strictTypeChecked`), Prettier, TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), unit tests, the build and the bundle-size budget. CI also runs the end-to-end tests in three browsers.
