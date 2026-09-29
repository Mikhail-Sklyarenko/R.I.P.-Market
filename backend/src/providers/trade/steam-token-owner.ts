const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
/** Accept only an explicit, unambiguous string identity from Steam HTTPS JSON.
 * Never decode JWT claims or use a caller-supplied identity as proof. */
export function steamTokenOwner(data: unknown): string | null {
  const root = object(data);
  if (!root) return null;
  const nested = object(root.response);
  if (
    root.error !== undefined ||
    root.success === false ||
    nested?.error !== undefined ||
    nested?.success === false
  )
    return null;
  const values = [root.steamid, nested?.steamid].filter(
    (value) => value !== undefined,
  );
  if (
    !values.length ||
    values.some(
      (value) => typeof value !== 'string' || !/^[1-9][0-9]{16}$/.test(value),
    )
  )
    return null;
  if (values.some((value) => value !== values[0])) return null;
  return values[0] as string;
}
