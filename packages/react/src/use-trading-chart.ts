import { createChart, type Chart, type ChartOptionsInput } from '@trading-chart-sdk/core';
import { useState } from 'react';
import { useBrowserLayoutEffect } from './layout-effect';

/**
 * Creates a chart in the element that receives the returned ref and destroys it when the element
 * goes away. `options` are applied with `chart.applyOptions()` whenever a new object is passed,
 * so keep them stable (a module constant or `useMemo`).
 *
 * ```tsx
 * const [ref, chart] = useTradingChart(options);
 * useEffect(() => chart?.data.set(bars), [chart, bars]);
 * return <div ref={ref} style={{ height: 480 }} />;
 * ```
 */
export function useTradingChart(
  options?: ChartOptionsInput
): [ref: (element: HTMLElement | null) => void, chart: Chart | null] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [chart, setChart] = useState<Chart | null>(null);

  useBrowserLayoutEffect(() => {
    if (!element) {
      return;
    }

    const instance = createChart(element);
    setChart(instance);

    return () => {
      instance.destroy();
      setChart(null);
    };
  }, [element]);

  useBrowserLayoutEffect(() => {
    if (chart && options) {
      chart.applyOptions(options);
    }
  }, [chart, options]);

  return [setElement, chart];
}
