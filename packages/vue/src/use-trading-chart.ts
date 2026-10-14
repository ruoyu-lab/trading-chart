import { createChart, type Chart, type ChartOptionsInput } from '@trading-chart-sdk/core';
import {
  onBeforeUnmount,
  onMounted,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef
} from 'vue';

/**
 * Creates a chart inside `target` once it is mounted and destroys it on unmount. Changes to
 * `options` are applied with `chart.applyOptions()`.
 *
 * ```ts
 * const container = useTemplateRef<HTMLDivElement>('container');
 * const chart = useTradingChart(container, { locale: 'zh-CN' });
 * ```
 */
export function useTradingChart(
  target: Ref<HTMLElement | null>,
  options?: MaybeRefOrGetter<ChartOptionsInput | undefined>
): ShallowRef<Chart | null> {
  const chart = shallowRef<Chart | null>(null);

  onMounted(() => {
    if (target.value) {
      chart.value = createChart(target.value, toValue(options));
    }
  });

  watch(
    () => toValue(options),
    (next) => {
      if (next) {
        chart.value?.applyOptions(next);
      }
    },
    { deep: true }
  );

  onBeforeUnmount(() => {
    chart.value?.destroy();
    chart.value = null;
  });

  return chart;
}
