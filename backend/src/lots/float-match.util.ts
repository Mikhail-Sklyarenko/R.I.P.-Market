const FLOAT_EPSILON = 0.000001;

export function normalizeFloatValue(
  value?: string | number | null,
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

export function floatsMatch(
  expected?: string | number | null,
  observed?: string | number | null,
  epsilon = FLOAT_EPSILON,
): boolean {
  const expectedValue = normalizeFloatValue(expected);
  const observedValue = normalizeFloatValue(observed);
  if (expectedValue === null) {
    return true;
  }
  if (observedValue === null) {
    return false;
  }
  return Math.abs(expectedValue - observedValue) <= epsilon;
}
