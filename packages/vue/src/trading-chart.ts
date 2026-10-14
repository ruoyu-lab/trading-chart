import type {
  AlertInput,
  BarInput,
  Chart,
  ChartEventMap,
  ChartOptionsInput,
  MarkerInput,
  OrderInput
} from '@trading-chart-sdk/core';
import { defineComponent, h, ref, watch, type PropType } from 'vue';
import { useTradingChart } from './use-trading-chart';

type EventName = keyof ChartEventMap;

const EVENTS = [
  'crosshairMove',
  'visibleRangeChange',
  'loadMore',
  'click',
  'doubleClick',
  'contextMenu',
  'selectionChange',
  'paneResize',
  'drawingsChange',
  'toolChange',
  'orderDrag',
  'alertDrag',
  'buttonClick',
  'alertTrigger'
] as const satisfies readonly EventName[];

/** Validators only type the emitted events; every payload is accepted. */
const emits = {
  ready: (_chart: Chart) => true,
  crosshairMove: (_event: ChartEventMap['crosshairMove']) => true,
  visibleRangeChange: (_event: ChartEventMap['visibleRangeChange']) => true,
  loadMore: (_event: ChartEventMap['loadMore']) => true,
  click: (_event: ChartEventMap['click']) => true,
  doubleClick: (_event: ChartEventMap['doubleClick']) => true,
  contextMenu: (_event: ChartEventMap['contextMenu']) => true,
  selectionChange: (_event: ChartEventMap['selectionChange']) => true,
  paneResize: (_event: ChartEventMap['paneResize']) => true,
  drawingsChange: (_event: ChartEventMap['drawingsChange']) => true,
  toolChange: (_event: ChartEventMap['toolChange']) => true,
  orderDrag: (_event: ChartEventMap['orderDrag']) => true,
  alertDrag: (_event: ChartEventMap['alertDrag']) => true,
  buttonClick: (_event: ChartEventMap['buttonClick']) => true,
  alertTrigger: (_event: ChartEventMap['alertTrigger']) => true
};

/**
 * Vue 3 component around `createChart()`. Props replace the chart's data, orders, markers or
 * alerts whenever their value changes; every chart event is re-emitted (e.g. `@crosshair-move`,
 * `@order-drag`), plus `@ready` with the chart instance. Stream real-time bars with
 * `chart.data.update()`; manage indicators and drawings through the instance and persist them
 * with `chart.saveState()`.
 */
export const TradingChart = defineComponent({
  name: 'TradingChart',
  props: {
    options: { type: Object as PropType<ChartOptionsInput>, default: undefined },
    /** Replaces all bars when the array changes. */
    data: { type: Array as PropType<readonly BarInput[]>, default: undefined },
    orders: { type: Array as PropType<readonly OrderInput[]>, default: undefined },
    markers: { type: Array as PropType<readonly MarkerInput[]>, default: undefined },
    alerts: { type: Array as PropType<readonly AlertInput[]>, default: undefined }
  },
  emits,
  setup(props, { emit, expose }) {
    const container = ref<HTMLDivElement | null>(null);
    const chart = useTradingChart(container, () => props.options);

    /** Applies a prop once the chart exists and whenever the prop changes. */
    const sync = <T>(
      source: () => T | undefined,
      apply: (chart: Chart, value: T) => void,
      deep: boolean
    ) => {
      const run = () => {
        const instance = chart.value;
        const value = source();

        if (instance && value !== undefined) {
          apply(instance, value);
        }
      };

      watch(chart, run);
      watch(source, run, { deep });
    };

    sync(
      () => props.data,
      (instance, bars) => {
        instance.data.set(bars);
      },
      false
    );
    sync(
      () => props.orders,
      (instance, orders) => {
        instance.orders.set(orders);
      },
      true
    );
    sync(
      () => props.markers,
      (instance, markers) => {
        instance.markers.set(markers);
      },
      true
    );
    sync(
      () => props.alerts,
      (instance, alerts) => {
        instance.alerts.set(alerts);
      },
      true
    );

    watch(chart, (instance, _previous, onCleanup) => {
      if (!instance) {
        return;
      }

      // `emits` declares exactly the events in EVENTS, each with its ChartEventMap payload.
      const forward = emit as (name: EventName, payload: ChartEventMap[EventName]) => void;
      const unsubscribe = EVENTS.map((name) =>
        instance.on(name, (event) => {
          forward(name, event);
        })
      );
      onCleanup(() => {
        unsubscribe.forEach((off) => {
          off();
        });
      });
      emit('ready', instance);
    });

    expose({ chart });

    return () => h('div', { ref: container, style: { width: '100%', height: '100%' } });
  }
});
