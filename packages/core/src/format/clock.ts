import { LruCache } from '../utils/lru-cache';

const HOUR_MS = 3_600_000;

export interface CalendarFields {
  year: number;
  /** 0-based month. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const part = parts.find((item) => item.type === type);
  return part ? Number(part.value) : 0;
}

/**
 * Converts instants into calendar fields of one time zone. Zone offsets are looked up once per
 * hour bucket and cached, so per-bar conversions stay cheap.
 */
export class Clock {
  private readonly offsets = new LruCache<number, number>(4096);
  private readonly zoneFormat: Intl.DateTimeFormat | null;

  constructor(readonly timeZone: string | undefined) {
    this.zoneFormat =
      timeZone === undefined
        ? null
        : new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
          });
  }

  fields(time: number): CalendarFields {
    if (!this.zoneFormat) {
      const date = new Date(time);
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        second: date.getSeconds()
      };
    }

    const format = this.zoneFormat;
    const bucket = Math.floor(time / HOUR_MS);
    const offset = this.offsets.getOrCreate(bucket, () => {
      const instant = bucket * HOUR_MS;
      const parts = format.formatToParts(instant);
      const asUtc = Date.UTC(
        readPart(parts, 'year'),
        readPart(parts, 'month') - 1,
        readPart(parts, 'day'),
        readPart(parts, 'hour'),
        readPart(parts, 'minute'),
        readPart(parts, 'second')
      );
      return asUtc - instant;
    });
    const shifted = new Date(time + offset);

    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth(),
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds()
    };
  }
}
