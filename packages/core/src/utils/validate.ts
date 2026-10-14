import { describeValue, fail } from './errors';

interface NumberRule {
  min?: number;
  max?: number;
  /** Excludes `min` itself. */
  exclusiveMin?: boolean;
  integer?: boolean;
}

export function checkNumber(path: string, value: unknown, rule: NumberRule = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(`${path} must be a finite number, received ${describeValue(value)}.`);
  }

  if (rule.integer && !Number.isInteger(value)) {
    fail(`${path} must be an integer, received ${value}.`);
  }

  if (rule.min !== undefined && (rule.exclusiveMin ? value <= rule.min : value < rule.min)) {
    fail(
      `${path} must be ${rule.exclusiveMin ? 'greater than' : 'at least'} ${rule.min}, received ${value}.`
    );
  }

  if (rule.max !== undefined && value > rule.max) {
    fail(`${path} must be at most ${rule.max}, received ${value}.`);
  }

  return value;
}

export function checkBoolean(path: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    return fail(`${path} must be a boolean, received ${describeValue(value)}.`);
  }

  return value;
}

export function checkString(path: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    return fail(`${path} must be a non-empty string, received ${describeValue(value)}.`);
  }

  return value;
}

export function checkOneOf<T extends string>(
  path: string,
  value: unknown,
  allowed: readonly T[]
): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    return fail(
      `${path} must be one of ${allowed.map((item) => `"${item}"`).join(', ')}, received ${describeValue(value)}.`
    );
  }

  return value as T;
}

export function checkObject(path: string, value: unknown): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path} must be an object, received ${describeValue(value)}.`);
  }
}

export function checkArray(path: string, value: unknown): void {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array, received ${describeValue(value)}.`);
  }
}

export function checkFunctionOrNull(path: string, value: unknown): void {
  if (value !== null && typeof value !== 'function') {
    fail(`${path} must be a function or null, received ${describeValue(value)}.`);
  }
}
