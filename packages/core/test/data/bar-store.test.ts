import { describe, expect, it } from 'vitest';
import { BarStore } from '../../src/data/bar-store';
import { ChartError } from '../../src/utils/errors';
import { createBars, MINUTE, T0 } from '../helpers/bars';

describe('BarStore', () => {
  it('stores bars in time order and exposes columns', () => {
    const store = new BarStore();
    store.set(createBars(3));

    expect(store.length).toBe(3);
    expect(store.time(2)).toBe(T0 + 2 * MINUTE);
    expect(store.bar(1)).toMatchObject({ time: T0 + MINUTE, volume: 1010 });
    expect(store.bar(3)).toBeNull();
    expect(store.price(0, 'hl2')).toBe((store.high(0) + store.low(0)) / 2);
  });

  it('parses ISO strings and dates', () => {
    const store = new BarStore();
    store.set([
      { time: '2024-01-02T00:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5 },
      { time: new Date('2024-01-03T00:00:00Z'), open: 1, high: 2, low: 0.5, close: 1.5 }
    ]);

    expect(store.time(0)).toBe(Date.UTC(2024, 0, 2));
    expect(store.time(1)).toBe(Date.UTC(2024, 0, 3));
    expect(store.volume(0)).toBe(0);
  });

  it('rejects unsorted, duplicate and inconsistent bars without changing state', () => {
    const store = new BarStore();
    store.set(createBars(2));
    const revision = store.revision;
    const [first, second] = createBars(2);

    expect(() => {
      store.set([second!, first!]);
    }).toThrow(/strictly ascending/);
    expect(() => {
      store.set([first!, first!]);
    }).toThrow(ChartError);
    expect(() => {
      store.set([{ time: T0, open: 10, high: 9, low: 8, close: 9 }]);
    }).toThrow(/inconsistent/);
    expect(() => {
      store.set([{ time: 'not a date', open: 1, high: 1, low: 1, close: 1 }]);
    }).toThrow(/not a valid point in time/);
    expect(store.revision).toBe(revision);
    expect(store.length).toBe(2);
  });

  it('update() replaces the last bar or appends newer ones', () => {
    const store = new BarStore();
    store.set(createBars(3));
    const revision = store.revision;
    const last = createBars(3)[2]!;

    store.update([{ ...last, close: last.close + 0.5, high: last.high + 0.5 }]);
    expect(store.length).toBe(3);
    expect(store.changesSince(revision)).toEqual({ kind: 'tail', from: 2 });

    store.update(createBars(5).slice(3));
    expect(store.length).toBe(5);
    expect(store.changesSince(revision)).toEqual({ kind: 'tail', from: 2 });
    expect(store.changesSince(store.revision)).toBeNull();
  });

  it('update() rejects bars older than the last bar, also within one batch', () => {
    const store = new BarStore();
    store.set(createBars(3));
    const bars = createBars(6);

    expect(() => {
      store.update([bars[1]!]);
    }).toThrow(/older than the last bar/);
    expect(() => {
      store.update([bars[5]!, bars[4]!]);
    }).toThrow(/older than the last bar/);
    expect(store.length).toBe(3);
  });

  it('prepend() inserts older bars and ignores overlapping ones', () => {
    const store = new BarStore();
    const all = createBars(12);
    store.set(all.slice(8));

    const inserted = store.prepend(all.slice(5, 10));

    expect(inserted).toBe(3);
    expect(store.toArray().map((bar) => (bar.time - T0) / MINUTE)).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(store.changesSince(0)).toEqual({ kind: 'reset' });
  });

  it('grows capacity across many appends', () => {
    const store = new BarStore();
    const bars = createBars(1000);

    bars.forEach((bar) => {
      store.update([bar]);
    });

    expect(store.length).toBe(1000);
    expect(store.close(999)).toBe(bars[999]!.close);
    expect(store.interval()).toBe(MINUTE);
  });

  it('finds indices by time', () => {
    const store = new BarStore();
    store.set(createBars(10));

    expect(store.indexOf(T0 + 4 * MINUTE)).toBe(4);
    expect(store.indexOf(T0 + 4 * MINUTE + 1)).toBe(-1);
    expect(store.indexAt(T0 + 4 * MINUTE + 30_000)).toBe(4);
    expect(store.indexAt(T0 - 1)).toBe(-1);
    expect(store.lowerBound(T0 + 100 * MINUTE)).toBe(10);
  });

  it('reports a reset to consumers that fell behind the change log', () => {
    const store = new BarStore();
    store.set(createBars(1));
    const revision = store.revision;

    for (let index = 0; index < 300; index += 1) {
      store.update([{ time: T0, open: 1, high: 2, low: 0.5, close: 1 + index / 1000 }]);
    }

    expect(store.changesSince(revision)).toEqual({ kind: 'reset' });
  });
});
