import { toTime, type TimeInput } from '../../data/time';
import type { Bar, BarInput } from '../../data/types';
import type { ChartCore } from '../chart-core';

/** The main OHLCV series. Inputs are validated and copied; the chart never mutates them. */
export interface DataApi {
  /** Replaces all bars. Bars must be sorted by strictly ascending time. */
  set(bars: readonly BarInput[]): void;
  /**
   * Streams real-time data: a bar with the time of the last bar replaces it, newer bars are
   * appended. Older bars are rejected; use `set()` or `prepend()` for history.
   */
  update(bar: BarInput | readonly BarInput[]): void;
  /**
   * Adds older bars before the first one, typically in response to `loadMore`. Bars at or after
   * the current first bar are ignored. Returns how many bars were inserted.
   */
  prepend(bars: readonly BarInput[]): number;
  clear(): void;
  readonly length: number;
  at(index: number): Bar | null;
  last(): Bar | null;
  /** Index of the bar with exactly this time, or `-1`. */
  indexOf(time: TimeInput): number;
  toArray(): Bar[];
}

export function createDataApi(core: ChartCore): DataApi {
  return {
    set: (bars) => {
      core.run(() => {
        core.setData(bars);
      });
    },
    update: (bar) => {
      core.run(() => {
        core.updateData(Array.isArray(bar) ? bar : [bar as BarInput]);
      });
    },
    prepend: (bars) => core.run(() => core.prependData(bars)),
    clear: () => {
      core.run(() => {
        core.clearData();
      });
    },
    get length() {
      return core.bars.length;
    },
    at: (index) => core.bars.bar(index),
    last: () => core.bars.bar(core.bars.length - 1),
    indexOf: (time) => core.bars.indexOf(toTime(time)),
    toArray: () => core.bars.toArray()
  };
}
