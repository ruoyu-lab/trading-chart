# @trading-chart-sdk/core

A framework-agnostic Canvas SDK for trading charts: candlesticks, 19 indicators, 13 drawing tools, draggable orders, markers and price alerts. No runtime dependencies, 68 kB gzipped.

```bash
npm install @trading-chart-sdk/core
```

```ts
import { createChart } from '@trading-chart-sdk/core';

const chart = createChart(document.getElementById('chart')!, { locale: 'en-US' });
chart.data.set(bars);
chart.indicators.add({ type: 'MACD' });
socket.onmessage = (message) => chart.data.update(JSON.parse(message.data));
```

Documentation, examples and the Vue adapter: [github.com/ruoyu-lab/trading-chart-sdk](https://github.com/ruoyu-lab/trading-chart-sdk#readme).

MIT License
