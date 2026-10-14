# @trading-chart-sdk/react

React component and hook for [`@trading-chart-sdk/core`](https://github.com/ruoyu-lab/trading-chart-sdk). Supports React 18.3 and 19, StrictMode and Next.js.

```bash
npm install @trading-chart-sdk/core @trading-chart-sdk/react
```

```tsx
import { TradingChart } from '@trading-chart-sdk/react';
import type { Chart } from '@trading-chart-sdk/core';

const onReady = (chart: Chart) => chart.indicators.add({ type: 'MACD' });

export const View = () => (
  <TradingChart style={{ height: 480 }} data={bars} orders={orders} onReady={onReady} />
);
```

See the [React guide](https://github.com/ruoyu-lab/trading-chart-sdk/blob/main/docs/react.md).

MIT License
