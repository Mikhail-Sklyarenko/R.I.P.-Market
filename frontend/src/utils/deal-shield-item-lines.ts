import type { Order } from '../api/types';

/** Deal Shield item lines from lot snapshot / asset (site parity with extension). */
export function buildOrderDealItemLines(
  order: Order,
  labels: { wear: string; float: string; stickers: string },
): Array<{ label: string; value: string }> {
  const snapshot = order.lot?.listingSnapshot;
  const asset = order.lot?.inventoryAsset;
  const wear = (snapshot?.wear ?? asset?.wear)?.trim() || null;
  const floatValue =
    (snapshot?.floatValue != null
      ? String(snapshot.floatValue)
      : asset?.floatValue != null
        ? String(asset.floatValue)
        : null
    )?.trim() || null;
  const stickers = snapshot?.stickers ?? asset?.stickers ?? [];
  const lines: Array<{ label: string; value: string }> = [];
  if (wear) {
    lines.push({ label: labels.wear, value: wear });
  }
  if (floatValue) {
    lines.push({ label: labels.float, value: floatValue });
  }
  if (Array.isArray(stickers) && stickers.length > 0) {
    lines.push({
      label: labels.stickers,
      value: stickers
        .map((s) => {
          const name = typeof s === 'object' && s && 'name' in s ? String(s.name) : '';
          const wearPercent =
            typeof s === 'object' && s && 'wearPercent' in s && s.wearPercent != null
              ? ` (${s.wearPercent}%)`
              : '';
          return `${name}${wearPercent}`;
        })
        .filter(Boolean)
        .join(', '),
    });
  }
  return lines;
}
