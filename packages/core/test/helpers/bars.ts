import type { BarInput } from '../../src/data/types';

export const MINUTE = 60_000;
export const T0 = Date.UTC(2024, 0, 2, 9, 30);

/** Deterministic bars with a gentle up-and-down drift. */
export function createBars(count: number, start = T0, interval = MINUTE): BarInput[] {
  return Array.from({ length: count }, (_, index) => {
    const open = 100 + index * 0.5 + (index % 3);
    const close = open + (index % 2 === 0 ? 1.25 : -0.75);
    return {
      time: start + index * interval,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1000 + index * 10
    };
  });
}
