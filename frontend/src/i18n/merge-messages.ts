/**
 * Small recursive deep-merge for message dictionaries.
 *
 * `b` wins on leaf conflicts; plain nested objects are merged key-by-key so
 * `client-extra-*.ts` can add new namespaces (or new keys inside an existing
 * namespace) without clobbering the base dictionary.
 */

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

export type DeepMerge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? K extends keyof A
      ? A[K] extends PlainObject
        ? B[K] extends PlainObject
          ? DeepMerge<A[K], B[K]>
          : B[K]
        : B[K]
      : B[K]
    : K extends keyof A
      ? A[K]
      : never;
};

export function deepMerge<A extends PlainObject, B extends PlainObject>(
  base: A,
  extra: B,
): DeepMerge<A, B> {
  const result: PlainObject = { ...base };
  for (const key of Object.keys(extra)) {
    const extraValue = extra[key];
    const baseValue = result[key];
    result[key] =
      isPlainObject(baseValue) && isPlainObject(extraValue)
        ? deepMerge(baseValue, extraValue)
        : extraValue;
  }
  return result as DeepMerge<A, B>;
}
