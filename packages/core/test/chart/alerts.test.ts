import { describe, expect, it, vi } from 'vitest';
import type { AlertInput, ValueSource } from '../../src/alerts/types';
import type { BarInput } from '../../src/data/types';
import { MINUTE, T0 } from '../helpers/bars';
import { createTestChart, pointer } from '../helpers/chart';

function bar(index: number, close: number): BarInput {
  return { time: T0 + index * MINUTE, open: close, high: close + 1, low: close - 1, close };
}

/** A chart with ten bars closing at 100 and a recorder for alert triggers. */
function setup(alert: Partial<AlertInput> = {}) {
  const chart = createTestChart();
  chart.data.set(Array.from({ length: 10 }, (_, index) => bar(index, 100)));
  const triggers = vi.fn();
  chart.on('alertTrigger', triggers);
  chart.alerts.add({ id: 'a', trigger: 'cross-up', value: 105, ...alert });
  return { chart, triggers };
}

describe('alerts', () => {
  it('fires when a tick crosses the level, not when history loads', () => {
    const { chart, triggers } = setup();
    chart.data.update(bar(9, 104));
    expect(triggers).not.toHaveBeenCalled();

    chart.data.update(bar(9, 106));
    expect(triggers).toHaveBeenCalledWith({
      id: 'a',
      time: T0 + 9 * MINUTE,
      value: 106,
      threshold: 105,
      trigger: 'cross-up'
    });

    chart.data.set(Array.from({ length: 10 }, (_, index) => bar(index, index % 2 ? 90 : 120)));
    expect(triggers).toHaveBeenCalledTimes(1);
  });

  it('does not fire on creation when the condition already holds', () => {
    const { triggers } = setup({ trigger: 'above', value: 50 });
    expect(triggers).not.toHaveBeenCalled();
  });

  it('fires once and waits for rearm with frequency "once"', () => {
    const { chart, triggers } = setup({ trigger: 'cross', frequency: 'once' });
    chart.data.update(bar(9, 106));
    chart.data.update(bar(9, 104));

    expect(triggers).toHaveBeenCalledTimes(1);
    expect(chart.alerts.get('a')?.status).toBe('triggered');

    chart.alerts.rearm('a');
    chart.data.update(bar(9, 106));
    expect(triggers).toHaveBeenCalledTimes(2);
  });

  it('fires at most once per bar with "once-per-bar"', () => {
    const { chart, triggers } = setup({ trigger: 'cross', frequency: 'once-per-bar' });
    chart.data.update(bar(9, 106));
    chart.data.update(bar(9, 104));
    chart.data.update(bar(9, 106));
    expect(triggers).toHaveBeenCalledTimes(1);

    chart.data.update(bar(10, 104));
    expect(triggers).toHaveBeenCalledTimes(2);
  });

  it('fires on every crossing with "every-time", without repeating while the price stays above', () => {
    const { chart, triggers } = setup({ trigger: 'cross-up', frequency: 'every-time' });
    chart.data.update(bar(9, 106));
    chart.data.update(bar(9, 107));
    chart.data.update(bar(9, 108));
    expect(triggers).toHaveBeenCalledTimes(1);

    chart.data.update(bar(9, 103));
    chart.data.update(bar(9, 106));
    expect(triggers).toHaveBeenCalledTimes(2);
  });

  it('evaluates closed bars only with "once-per-bar-close"', () => {
    const { chart, triggers } = setup({ frequency: 'once-per-bar-close' });
    chart.data.update(bar(9, 106));
    expect(triggers).not.toHaveBeenCalled();

    chart.data.update(bar(10, 100));
    expect(triggers).toHaveBeenCalledWith(
      expect.objectContaining({ time: T0 + 9 * MINUTE, value: 106 })
    );
  });

  it('catches a crossing inside a batch of new bars', () => {
    const { chart, triggers } = setup({ trigger: 'cross-up', frequency: 'every-time' });
    chart.data.update([bar(10, 106), bar(11, 100)]);

    expect(triggers).toHaveBeenCalledWith(expect.objectContaining({ time: T0 + 10 * MINUTE }));
  });

  it('keeps per-bar state across history backfills', () => {
    const { chart, triggers } = setup({ trigger: 'cross', frequency: 'once-per-bar' });
    chart.data.update(bar(9, 106));
    chart.data.prepend(Array.from({ length: 5 }, (_, index) => bar(index - 5, 100)));
    chart.data.update(bar(9, 104));

    expect(triggers).toHaveBeenCalledTimes(1);
  });

  it('compares indicator outputs', () => {
    const chart = createTestChart();
    chart.data.set(Array.from({ length: 10 }, (_, index) => bar(index, 100)));
    const ma = chart.indicators.add({ type: 'MA', params: { periods: [2] } });
    const triggers = vi.fn();
    chart.on('alertTrigger', triggers);
    chart.alerts.add({
      id: 'ma-up',
      source: { kind: 'indicator', id: ma, key: 'ma2' },
      trigger: 'cross-up',
      value: 102
    });
    chart.data.update(bar(10, 106));

    expect(triggers).toHaveBeenCalledWith(expect.objectContaining({ id: 'ma-up', value: 103 }));
  });

  it('turns into a draggable level that re-baselines after the drag', () => {
    const { chart } = setup();
    chart.alerts.update('a', { value: 98 });

    expect(chart.alerts.get('a')).toMatchObject({ value: 98, status: 'active' });
    expect(() => {
      chart.alerts.add({ id: 'b', trigger: 'sideways' as 'cross', value: 1 });
    }).toThrow('alert.trigger');
    expect(() => {
      chart.alerts.add({
        id: 'c',
        source: { kind: 'indicator', id: 'nope', key: 'x' },
        trigger: 'cross',
        value: 1
      });
    }).toThrow('unknown indicator "nope"');
  });

  it('re-baselines while its level is dragged, so moving past the price does not fire', () => {
    const chart = createTestChart({ priceScale: { precision: 2 } });
    chart.data.set(Array.from({ length: 10 }, (_, index) => bar(index, 100)));
    chart.alerts.add({ id: 'a', trigger: 'cross-up', value: 100.6 });
    const triggers = vi.fn();
    chart.on('alertTrigger', triggers);
    const from = chart.priceScale().priceToY(100.6) ?? 0;
    const to = chart.priceScale().priceToY(99.6) ?? 0;
    pointer(chart, 'pointerdown', 200, from);
    pointer(chart, 'pointermove', 200, to);
    chart.data.update(bar(9, 100.1));
    pointer(chart, 'pointerup', 200, to);
    chart.data.update(bar(9, 100.2));

    expect(chart.alerts.get('a')?.value).toBeLessThan(100);
    expect(triggers).not.toHaveBeenCalled();
  });

  it('keeps the state of unchanged alerts in set()', () => {
    const { chart, triggers } = setup({ frequency: 'once' });
    chart.data.update(bar(9, 106));
    chart.alerts.set([{ id: 'a', trigger: 'cross-up', value: 105, frequency: 'once' }]);

    expect(chart.alerts.get('a')?.status).toBe('triggered');

    chart.alerts.set([{ id: 'a', trigger: 'cross-up', value: 110, frequency: 'once' }]);
    expect(chart.alerts.get('a')?.status).toBe('active');
    expect(triggers).toHaveBeenCalledTimes(1);
  });

  it('protects the indicator outputs it reads', () => {
    const chart = createTestChart();
    chart.data.set(Array.from({ length: 10 }, (_, index) => bar(index, 100)));
    const ma = chart.indicators.add({ type: 'MA', params: { periods: [2] } });
    chart.alerts.add({
      id: 'ma-up',
      source: { kind: 'indicator', id: ma, key: 'ma2' },
      trigger: 'cross-up',
      value: 102
    });

    expect(() => {
      chart.indicators.update(ma, { params: { periods: [3] } });
    }).toThrow('"ma2" (read by alert "ma-up")');
    expect(chart.indicators.get(ma)?.params).toEqual({ periods: [2] });

    chart.indicators.update(ma, { params: { periods: [2, 5] } });
    expect(chart.indicators.get(ma)?.params).toEqual({ periods: [2, 5] });
  });

  it('rejects inputs that are not objects', () => {
    const { chart } = setup();

    expect(() => {
      chart.alerts.add(null as unknown as AlertInput);
    }).toThrow('alert must be an object, received null');
    expect(() => {
      chart.alerts.add({
        id: 'b',
        source: 42 as unknown as ValueSource,
        trigger: 'cross',
        value: 1
      });
    }).toThrow('alert.source must be an object, received 42');
  });
});
