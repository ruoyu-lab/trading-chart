import type { TimeUnit } from '../options/types';
import { Clock } from './clock';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Locale- and time-zone-aware number and date formatting for one chart. */
export class Formatter {
  readonly clock: Clock;
  private readonly numberFormats = new Map<number, Intl.NumberFormat>();
  private readonly compactFormat: Intl.NumberFormat;
  private readonly timeFormats: Record<TimeUnit, Intl.DateTimeFormat>;
  private readonly dayFormat: Intl.DateTimeFormat;
  private readonly minuteFormat: Intl.DateTimeFormat;
  private readonly secondFormat: Intl.DateTimeFormat;

  constructor(
    readonly locale: string | undefined,
    readonly timeZone: string | undefined
  ) {
    this.clock = new Clock(timeZone);
    this.compactFormat = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 2
    });
    const date = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { timeZone, ...options });
    const clockTime: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    };

    this.timeFormats = {
      year: date({ year: 'numeric' }),
      month: date({ month: 'short' }),
      day: date({ day: 'numeric' }),
      hour: date(clockTime),
      minute: date(clockTime),
      second: date({ ...clockTime, second: '2-digit' })
    };
    this.dayFormat = date({ year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
    this.minuteFormat = date({ year: 'numeric', month: 'short', day: 'numeric', ...clockTime });
    this.secondFormat = date({
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...clockTime,
      second: '2-digit'
    });
  }

  number(value: number, precision: number): string {
    let format = this.numberFormats.get(precision);

    if (!format) {
      format = new Intl.NumberFormat(this.locale, {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision
      });
      this.numberFormats.set(precision, format);
    }

    return format.format(value);
  }

  compact(value: number): string {
    return this.compactFormat.format(value);
  }

  timeTick(time: number, unit: TimeUnit): string {
    return this.timeFormats[unit].format(time);
  }

  /** Full date label for the crosshair; precision follows the bar interval. */
  timeCrosshair(time: number, interval: number | null): string {
    if (interval !== null && interval >= DAY_MS) {
      return this.dayFormat.format(time);
    }

    if (interval !== null && interval < MINUTE_MS) {
      return this.secondFormat.format(time);
    }

    return this.minuteFormat.format(time);
  }

  /** Countdown such as `42`, `03:05`, `1:02:03` or `2d 03:00:00`. */
  duration(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value: number) => String(value).padStart(2, '0');

    if (days > 0) {
      return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${pad(minutes)}:${pad(seconds)}`;
  }
}

/** Number of decimals needed to show every value exactly, capped at `max`. */
export function inferPrecision(values: Iterable<number>, max = 8): number {
  let precision = 0;

  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }

    while (precision < max) {
      const scaled = value * 10 ** precision;

      if (Math.abs(scaled - Math.round(scaled)) < Math.max(1e-9, Math.abs(scaled) * 1e-12)) {
        break;
      }

      precision += 1;
    }
  }

  return precision;
}
