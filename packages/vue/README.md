# @trading-chart-sdk/vue

Vue 3 component and composable for [`@trading-chart-sdk/core`](https://github.com/ruoyu-lab/trading-chart-sdk).

```bash
npm install @trading-chart-sdk/core @trading-chart-sdk/vue
```

```vue
<script setup lang="ts">
import { TradingChart } from '@trading-chart-sdk/vue';
import type { Chart } from '@trading-chart-sdk/core';

const onReady = (chart: Chart) => chart.indicators.add({ type: 'MACD' });
</script>

<template>
  <TradingChart style="height: 480px" :data="bars" :orders="orders" @ready="onReady" />
</template>
```

See the [Vue guide](https://github.com/ruoyu-lab/trading-chart-sdk/blob/main/docs/vue.md).

MIT License
