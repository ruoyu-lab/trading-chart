import { describe, expect, it } from 'vitest';
import { Clock } from '../../src/format/clock';
import { Formatter, inferPrecision } from '../../src/format/formatter';

describe('Clock', () => {
  it('converts instants to calendar fields of a time zone across DST', () => {
    const clock = new Clock('America/New_York');

    expect(clock.fields(Date.UTC(2024, 0, 15, 17, 30))).toMatchObject({ hour: 12, minute: 30 });
    expect(clock.fields(Date.UTC(2024, 6, 15, 16, 30))).toMatchObject({ hour: 12, minute: 30 });
  });
});

describe('Formatter', () => {
  const formatter = new Formatter('en-US', 'UTC');

  it('formats numbers with a fixed precision', () => {
    expect(formatter.number(1234.5, 2)).toBe('1,234.50');
    expect(formatter.number(0.000123, 6)).toBe('0.000123');
  });

  it('formats volumes compactly', () => {
    expect(formatter.compact(1_250_000)).toBe('1.25M');
  });

  it('formats tick labels per calendar unit', () => {
    const time = Date.UTC(2024, 2, 9, 14, 5);

    expect(formatter.timeTick(time, 'year')).toBe('2024');
    expect(formatter.timeTick(time, 'month')).toBe('Mar');
    expect(formatter.timeTick(time, 'day')).toBe('9');
    expect(formatter.timeTick(time, 'minute')).toBe('14:05');
  });

  it('formats countdowns', () => {
    expect(formatter.duration(65_000)).toBe('01:05');
    expect(formatter.duration(3_725_000)).toBe('1:02:05');
    expect(formatter.duration(2 * 86_400_000)).toBe('2d 00:00:00');
  });
});

describe('inferPrecision', () => {
  it('finds the decimals needed by the values', () => {
    expect(inferPrecision([1, 2, 3])).toBe(0);
    expect(inferPrecision([1.5, 2.25])).toBe(2);
    expect(inferPrecision([0.1 + 0.2])).toBe(1);
    expect(inferPrecision([123456.7891])).toBe(4);
    expect(inferPrecision([Math.PI])).toBe(8);
  });
});
