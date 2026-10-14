# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org/); while the version is below 1.0, minor releases may change the API.

## 0.1.0-beta.1

First public release.

### Added

- `@trading-chart-sdk/core`: a framework-agnostic core created with `createChart()`, with a namespaced, fully typed API for data, time and price scales, panes, series, indicators, drawings, orders, markers, alerts, the crosshair, layout state and screenshots.
- `@trading-chart-sdk/vue`: the `TradingChart` component and the `useTradingChart()` composable.
- `@trading-chart-sdk/react`: the `TradingChart` component and the `useTradingChart()` hook for React 18.3 and 19, with StrictMode and Next.js support.
- 11 series types, 19 streaming indicators and 13 drawing tools.
- Draggable order lines with label buttons, bar markers, and alerts on prices, indicators and series with four trigger frequencies.
- Calendar-aware time axis with locale and time-zone support; normal, logarithmic, percent and indexed price scales per pane.
- Mouse, trackpad, touch (long-press crosshair, pinch zoom) and keyboard interaction.
- Undoable drawing edits and atomic `saveState()` / `loadState()`.
