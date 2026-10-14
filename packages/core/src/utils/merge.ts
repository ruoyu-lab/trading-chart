/** Recursively optional version of `T`. Functions and arrays are replaced, never merged. */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Arrays from a patch are copied, so freezing the result never freezes the caller's array. */
function copyArray(value: unknown): unknown {
  return Array.isArray(value) ? [...(value as unknown[])] : value;
}

/**
 * Returns a new object where `patch` is merged into `base`. Plain objects are merged recursively,
 * every other value (arrays, functions, primitives) replaces the base value. `undefined` in the
 * patch keeps the base value.
 */
export function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (patch === undefined) {
    return base;
  }

  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return copyArray(patch) as T;
  }

  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || FORBIDDEN_KEYS.has(key)) {
      continue;
    }

    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : copyArray(value);
  }

  return result as T;
}

/** Freezes plain objects and arrays recursively; functions and other objects are left alone. */
export function deepFreeze<T>(value: T): T {
  if (isPlainObject(value) || Array.isArray(value)) {
    Object.values(value).forEach((nested) => {
      deepFreeze(nested);
    });
    Object.freeze(value);
  }

  return value;
}
