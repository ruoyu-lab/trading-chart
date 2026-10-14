import type {
  AlertInput,
  BarInput,
  Chart,
  ChartEventMap,
  ChartOptionsInput,
  MarkerInput,
  OrderInput
} from '@trading-chart-sdk/core';
import { createElement, forwardRef, useImperativeHandle, useRef, type CSSProperties } from 'react';
import { useBrowserLayoutEffect } from './layout-effect';
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

type HandlerName<K extends EventName> = `on${Capitalize<K>}`;

/** One optional `on*` prop per chart event, e.g. `onCrosshairMove` or `onOrderDrag`. */
export type TradingChartEventHandlers = {
  [K in EventName as HandlerName<K>]?: (event: ChartEventMap[K]) => void;
};

export interface TradingChartProps extends TradingChartEventHandlers {
  /** Applied with `chart.applyOptions()` whenever a new object is passed. */
  options?: ChartOptionsInput;
  /** Replaces all bars when a new array is passed. */
  data?: readonly BarInput[];
  orders?: readonly OrderInput[];
  markers?: readonly MarkerInput[];
  alerts?: readonly AlertInput[];
  className?: string;
  /** Merged over the default `width: 100%; height: 100%`. */
  style?: CSSProperties;
  /** Called once the chart is created, after the props above were applied. */
  onReady?: (chart: Chart) => void;
}

function handlerName<K extends EventName>(name: K): HandlerName<K> {
  return `on${name[0]?.toUpperCase() ?? ''}${name.slice(1)}` as HandlerName<K>;
}

/**
 * Applies `value` once the chart exists and whenever a new value is passed. `apply` must be a
 * stable (module-level) function.
 */
function useSync<T>(
  chart: Chart | null,
  value: T | undefined,
  apply: (chart: Chart, value: T) => void
): void {
  useBrowserLayoutEffect(() => {
    if (chart && value !== undefined) {
      apply(chart, value);
    }
  }, [chart, value, apply]);
}

/**
 * React component around `createChart()`. Props replace the chart's data, orders, markers or
 * alerts whenever a new value is passed (compare by reference, as React state does); every chart
 * event is available as an `on*` prop, plus `onReady` with the chart instance. A ref receives the
 * chart instance. Stream real-time bars with `chart.data.update()`.
 */
export const TradingChart = forwardRef<Chart | null, TradingChartProps>(
  function TradingChart(props, ref) {
    const { options, data, orders, markers, alerts, className, style } = props;
    const [container, chart] = useTradingChart(options);
    const latest = useRef(props);

    useBrowserLayoutEffect(() => {
      latest.current = props;
    });

    useSync(chart, data, setData);
    useSync(chart, orders, setOrders);
    useSync(chart, markers, setMarkers);
    useSync(chart, alerts, setAlerts);

    // Subscribe only to the events that have a handler, so unused events cost nothing.
    const handled = EVENTS.filter((name) => props[handlerName(name)] !== undefined).join(',');

    useBrowserLayoutEffect(() => {
      if (!chart || handled === '') {
        return;
      }

      const unsubscribe = EVENTS.filter((name) => handled.split(',').includes(name)).map((name) =>
        chart.on(name, (event) => {
          const handler = latest.current[handlerName(name)] as
            ((payload: ChartEventMap[EventName]) => void) | undefined;
          handler?.(event);
        })
      );

      return () => {
        unsubscribe.forEach((off) => {
          off();
        });
      };
    }, [chart, handled]);

    useBrowserLayoutEffect(() => {
      if (chart) {
        latest.current.onReady?.(chart);
      }
    }, [chart]);

    useImperativeHandle<Chart | null, Chart | null>(ref, () => chart, [chart]);

    return createElement('div', {
      ref: container,
      className,
      style: { width: '100%', height: '100%', ...style }
    });
  }
);

function setData(chart: Chart, bars: readonly BarInput[]): void {
  chart.data.set(bars);
}

function setOrders(chart: Chart, orders: readonly OrderInput[]): void {
  chart.orders.set(orders);
}

function setMarkers(chart: Chart, markers: readonly MarkerInput[]): void {
  chart.markers.set(markers);
}

function setAlerts(chart: Chart, alerts: readonly AlertInput[]): void {
  chart.alerts.set(alerts);
}
