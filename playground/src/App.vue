<script setup lang="ts">
import {
  darkTheme,
  lightTheme,
  type AlertInput,
  type Chart,
  type ChartOptionsInput,
  type OrderInput,
  type PriceDragEvent,
  type SeriesType
} from '@trading-chart-sdk/core';
import { TradingChart } from '@trading-chart-sdk/vue';
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { DRAWING_TOOLS } from './drawing-tools';
import { translate, type Language, type MessageKey } from './i18n';
import { INTERVALS, latestBars, nextTick, olderBars, type Interval } from './mock-data';

const CHART_TYPES: readonly SeriesType[] = [
  'candles',
  'hollow-candles',
  'ohlc',
  'line',
  'area',
  'baseline',
  'hlc-area',
  'step-line'
];
const INDICATORS = ['MA', 'EMA', 'BOLL', 'VOL', 'MACD', 'RSI', 'KDJ', 'ATR', 'DMI'] as const;
const LAYOUT_KEY = 'trading-chart-playground-layout';
const MAX_BARS = 6000;

const language = ref<Language>('zh');
const themeName = ref<'dark' | 'light'>('dark');
const interval = ref<Interval>(INTERVALS[0]);
const chartType = ref<SeriesType>('candles');
const live = ref(true);
const magnet = ref(false);
const activeIndicators = ref(new Set<string>(['MA', 'VOL', 'MACD']));
const activeTool = ref<string | null>(null);
const chart = shallowRef<Chart | null>(null);
const events = ref<string[]>([]);
const toast = ref('');
const barCount = ref(0);

const t = (key: MessageKey) => translate(language.value, key);
const data = computed(() => latestBars(1500, interval.value.ms));

const options = computed<ChartOptionsInput>(() => ({
  theme: themeName.value === 'dark' ? darkTheme : lightTheme,
  locale: language.value === 'zh' ? 'zh-CN' : 'en-US',
  mainSeries: { type: chartType.value },
  latestPrice: { countdown: true },
  drawings: { magnet: magnet.value }
}));

const lastClose = computed(() => data.value[data.value.length - 1]?.close ?? 100);
const orders = ref<OrderInput[]>([]);
const alerts = ref<AlertInput[]>([]);

function resetObjects(): void {
  const price = lastClose.value;
  orders.value = [
    {
      id: 'buy-limit',
      side: 'buy',
      price: Math.round(price * 0.996 * 100) / 100,
      label: 'LIMIT',
      quantity: 2,
      buttons: [{ id: 'cancel', icon: 'M6 6L18 18M18 6L6 18' }]
    },
    {
      id: 'take-profit',
      side: 'sell',
      price: Math.round(price * 1.005 * 100) / 100,
      label: 'TP',
      quantity: 2
    }
  ];
  alerts.value = [
    {
      id: 'breakout',
      trigger: 'cross',
      value: Math.round(price * 1.002 * 100) / 100,
      label: '🔔',
      frequency: 'once-per-bar'
    }
  ];
}

resetObjects();
watch(interval, resetObjects);
watch(data, (bars) => {
  barCount.value = bars.length;
});

function log(message: string): void {
  events.value = [message, ...events.value].slice(0, 6);
}

function notify(message: string): void {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) {
      toast.value = '';
    }
  }, 2500);
}

function syncIndicators(): void {
  const instance = chart.value;

  if (!instance) {
    return;
  }

  const existing = new Set(instance.indicators.list().map((indicator) => indicator.type));

  for (const type of INDICATORS) {
    const id = type.toLowerCase();

    if (activeIndicators.value.has(type) && !existing.has(type)) {
      instance.indicators.add({ id, type });
    } else if (!activeIndicators.value.has(type) && existing.has(type)) {
      instance.indicators.remove(id);
    }
  }
}

function toggleIndicator(type: string): void {
  const next = new Set(activeIndicators.value);

  if (next.has(type)) {
    next.delete(type);
  } else {
    next.add(type);
  }

  activeIndicators.value = next;
  syncIndicators();
}

function onReady(instance: Chart): void {
  chart.value = instance;
  // Exposed for experimenting in the browser console and for the end-to-end tests.
  Object.assign(window, { chart: instance });
  syncIndicators();
  barCount.value = instance.data.length;
}

function selectTool(type: string | null): void {
  const instance = chart.value;

  if (!instance) {
    return;
  }

  if (type === null || activeTool.value === type) {
    instance.drawings.cancelTool();
    activeTool.value = null;
  } else {
    instance.drawings.startTool(type);
    activeTool.value = type;
  }
}

function onOrderDrag(event: PriceDragEvent): void {
  if (event.phase === 'end') {
    orders.value = orders.value.map((order) =>
      order.id === event.id ? { ...order, price: event.price } : order
    );
    log(`order ${event.id} → ${event.price}`);
  }
}

function onAlertDrag(event: PriceDragEvent): void {
  if (event.phase === 'end') {
    alerts.value = alerts.value.map((alert) =>
      alert.id === event.id ? { ...alert, value: event.price } : alert
    );
    log(`alert ${event.id} → ${event.price}`);
  }
}

function onButtonClick(event: { kind: string; id: string; buttonId: string }): void {
  if (event.kind === 'order' && event.buttonId === 'cancel') {
    orders.value = orders.value.filter((order) => order.id !== event.id);
    notify(t('orderCancelled'));
  }
}

function onLoadMore(event: { before: number }): void {
  const instance = chart.value;
  const first = instance?.data.at(0);

  if (!instance || !first || instance.data.length >= MAX_BARS) {
    return;
  }

  window.setTimeout(() => {
    instance.data.prepend(olderBars(first, 500, interval.value.ms));
    barCount.value = instance.data.length;
    log(`load more before ${new Date(event.before).toLocaleString()}`);
  }, 250);
}

function saveLayout(): void {
  if (chart.value) {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(chart.value.saveState()));
    log('layout saved');
  }
}

function restoreLayout(): void {
  const saved = localStorage.getItem(LAYOUT_KEY);

  if (!saved || !chart.value) {
    notify(t('noLayout'));
    return;
  }

  chart.value.loadState(JSON.parse(saved) as Parameters<Chart['loadState']>[0]);
  activeIndicators.value = new Set(
    chart.value.indicators.list().map((indicator) => indicator.type)
  );
  chartType.value = chart.value.options().mainSeries.type;
  log('layout restored');
}

function downloadScreenshot(): void {
  chart.value?.screenshot().toBlob((blob) => {
    if (blob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'trading-chart.png';
      link.click();
      URL.revokeObjectURL(link.href);
    }
  });
}

const stream = window.setInterval(() => {
  const instance = chart.value;
  const last = instance?.data.last();

  if (instance && last && live.value) {
    instance.data.update(nextTick(last, interval.value.ms));
    barCount.value = instance.data.length;
  }
}, 400);

onBeforeUnmount(() => {
  window.clearInterval(stream);
});
</script>

<template>
  <div class="app" :data-theme="themeName">
    <header class="toolbar">
      <div class="brand">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18V9M9 18V5M14 18v-6M19 18V8" />
        </svg>
        <span>Trading Chart SDK</span>
      </div>

      <div class="group" :aria-label="t('interval')">
        <button
          v-for="item in INTERVALS"
          :key="item.label"
          :class="{ active: item.label === interval.label }"
          @click="interval = item"
        >
          {{ item.label }}
        </button>
      </div>

      <label class="group">
        <span class="label">{{ t('chartType') }}</span>
        <select v-model="chartType">
          <option v-for="type in CHART_TYPES" :key="type" :value="type">{{ type }}</option>
        </select>
      </label>

      <div class="group indicators" :aria-label="t('indicators')">
        <button
          v-for="type in INDICATORS"
          :key="type"
          :class="{ active: activeIndicators.has(type) }"
          @click="toggleIndicator(type)"
        >
          {{ type }}
        </button>
      </div>

      <div class="spacer" />

      <div class="group">
        <button :class="{ active: live }" @click="live = !live">
          <span class="dot" :class="{ on: live }" />{{ live ? t('live') : t('paused') }}
        </button>
        <button @click="chart?.timeScale.fitContent()">{{ t('fit') }}</button>
        <button @click="chart?.timeScale.scrollToRealTime()">{{ t('realTime') }}</button>
      </div>

      <div class="group">
        <button @click="saveLayout">{{ t('save') }}</button>
        <button @click="restoreLayout">{{ t('restore') }}</button>
        <button @click="downloadScreenshot">{{ t('screenshot') }}</button>
      </div>

      <div class="group">
        <button @click="themeName = themeName === 'dark' ? 'light' : 'dark'">
          {{ themeName === 'dark' ? t('light') : t('dark') }}
        </button>
        <button @click="language = language === 'zh' ? 'en' : 'zh'">
          {{ language === 'zh' ? 'EN' : '中文' }}
        </button>
      </div>
    </header>

    <div class="workspace">
      <nav class="tools">
        <button
          :class="{ active: activeTool === null }"
          :title="t('cursor')"
          @click="selectTool(null)"
        >
          <svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-3 6z" /></svg>
        </button>
        <button
          v-for="tool in DRAWING_TOOLS"
          :key="tool.type"
          :class="{ active: activeTool === tool.type }"
          :title="tool.label[language]"
          @click="selectTool(tool.type)"
        >
          <svg viewBox="0 0 24 24"><path :d="tool.icon" /></svg>
        </button>
        <div class="separator" />
        <button :class="{ active: magnet }" :title="t('magnet')" @click="magnet = !magnet">
          <svg viewBox="0 0 24 24"><path d="M6 4v8a6 6 0 0012 0V4M6 8h4M14 8h4" /></svg>
        </button>
        <button :title="t('undo')" @click="chart?.drawings.undo()">
          <svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3" /></svg>
        </button>
        <button :title="t('redo')" @click="chart?.drawings.redo()">
          <svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3" /></svg>
        </button>
        <button :title="t('clearDrawings')" @click="chart?.drawings.clear()">
          <svg viewBox="0 0 24 24">
            <path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </button>
      </nav>

      <main class="chart">
        <TradingChart
          :options="options"
          :data="data"
          :orders="orders"
          :alerts="alerts"
          @ready="onReady"
          @order-drag="onOrderDrag"
          @alert-drag="onAlertDrag"
          @button-click="onButtonClick"
          @load-more="onLoadMore"
          @alert-trigger="(event) => notify(`${t('alertFired')} @ ${event.value}`)"
          @tool-change="activeTool = null"
          @drawings-change="(event) => log(`drawings ${event.reason}`)"
        />
        <transition name="fade">
          <div v-if="toast" class="toast">{{ toast }}</div>
        </transition>
      </main>
    </div>

    <footer class="status">
      <span>{{ barCount }} {{ t('bars') }}</span>
      <span class="events">{{ t('events') }}: {{ events.join(' · ') }}</span>
    </footer>
  </div>
</template>
