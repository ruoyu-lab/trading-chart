const PREFIX = '[trading-chart]';

/** Error thrown for every invalid argument, unknown id or illegal state reported by the SDK. */
export class ChartError extends Error {
  override readonly name = 'ChartError';

  constructor(message: string) {
    super(`${PREFIX} ${message}`);
  }
}

export function fail(message: string): never {
  throw new ChartError(message);
}

export function describeValue(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (Array.isArray(value)) {
    return 'an array';
  }

  return typeof value === 'object' ? 'an object' : typeof value;
}
