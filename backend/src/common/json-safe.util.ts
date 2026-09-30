export function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) => {
      // Server-only verification state must not disclose either party's entire
      // inventory or worker fencing tokens through existing order serializers.
      if (['inventoryBaseline', 'verificationLeaseToken'].includes(_key))
        return undefined;
      if (typeof nestedValue === 'bigint') {
        return nestedValue.toString();
      }
      // Prisma Decimal / decimal.js — always emit a plain string for API clients.
      if (
        nestedValue != null &&
        typeof nestedValue === 'object' &&
        typeof (nestedValue as { toFixed?: unknown }).toFixed === 'function' &&
        typeof (nestedValue as { toNumber?: unknown }).toNumber === 'function'
      ) {
        return (nestedValue as { toString: () => string }).toString();
      }
      return nestedValue;
    }),
  ) as T;
}
