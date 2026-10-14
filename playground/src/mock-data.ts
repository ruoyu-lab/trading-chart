import type { Bar, BarInput } from '@trading-chart-sdk/core';

export interface Interval {
  label: string;
  ms: number;
}

export const INTERVALS = [
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 300_000 },
  { label: '1h', ms: 3_600_000 },
  { label: '1D', ms: 86_400_000 }
] as const satisfies readonly Interval[];

/** Small deterministic PRNG so every reload shows the same market. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function step(open: number, next: () => number, volatility: number): BarInput & { close: number } {
  const close = Math.max(1, open * (1 + (next() - 0.495) * volatility));
  return {
    time: 0,
    open: round(open),
    high: round(Math.max(open, close) * (1 + next() * volatility * 0.4)),
    low: round(Math.min(open, close) * (1 - next() * volatility * 0.4)),
    close: round(close),
    volume: Math.round(800 + next() * 9000)
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `count` bars whose last bar is the current period. */
export function latestBars(count: number, interval: number, seed = 7): BarInput[] {
  const next = random(seed);
  const volatility = Math.min(0.02, 0.0025 * Math.sqrt(interval / 60_000));
  const start = Math.floor(Date.now() / interval) * interval - (count - 1) * interval;
  const bars: BarInput[] = [];
  let open = 100;

  for (let index = 0; index < count; index += 1) {
    const bar = step(open, next, volatility);
    bars.push({ ...bar, time: start + index * interval });
    open = bar.close;
  }

  return bars;
}

/** `count` bars ending right before `first`, walking backwards from its open. */
export function olderBars(first: Bar, count: number, interval: number): BarInput[] {
  const next = random(Math.floor(first.time / interval) % 100_000);
  const volatility = Math.min(0.02, 0.0025 * Math.sqrt(interval / 60_000));
  const bars: BarInput[] = [];
  let close = first.open;

  for (let index = 1; index <= count; index += 1) {
    const bar = step(close, next, volatility);
    // Walking backwards: this bar closes where the newer bar opens.
    bars.unshift({
      ...bar,
      open: bar.close,
      close: round(close),
      time: first.time - index * interval,
      high: Math.max(bar.high, close, bar.close),
      low: Math.min(bar.low, close, bar.close)
    });
    close = bar.close;
  }

  return bars;
}

/** The next tick of the forming bar, or a new bar once its period is over. */
export function nextTick(last: Bar, interval: number): BarInput {
  const now = Date.now();
  const period = Math.floor(now / interval) * interval;
  const drift = (Math.random() - 0.5) * last.close * 0.0012;
  const price = round(Math.max(1, last.close + drift));

  if (period > last.time) {
    return {
      time: period,
      open: last.close,
      high: Math.max(last.close, price),
      low: Math.min(last.close, price),
      close: price,
      volume: 200
    };
  }

  return {
    time: last.time,
    open: last.open,
    high: Math.max(last.high, price),
    low: Math.min(last.low, price),
    close: price,
    volume: last.volume + Math.round(Math.random() * 120)
  };
}
