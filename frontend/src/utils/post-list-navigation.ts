/**
 * After a successful list, keep the seller in inventory so they can list the
 * next skin. Forced redirect to /deals breaks serial listing.
 */

export type InventoryListedSuccess = {
  quantity: number;
};

export function parseInventoryListedSuccess(
  searchParams: URLSearchParams,
): InventoryListedSuccess | null {
  if (searchParams.get('listed') !== '1') {
    return null;
  }
  const rawCount = searchParams.get('listedCount');
  const parsed = rawCount ? Number(rawCount) : 1;
  const quantity =
    Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
  return { quantity };
}

export function buildInventoryListedPath(quantity = 1): string {
  const params = new URLSearchParams();
  params.set('listed', '1');
  if (quantity > 1) {
    params.set('listedCount', String(quantity));
  }
  return `/sell/inventory?${params.toString()}`;
}

export function stripListedSuccessParams(
  searchParams: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  next.delete('listed');
  next.delete('listedCount');
  return next;
}
