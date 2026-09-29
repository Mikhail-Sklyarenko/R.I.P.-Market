export const RECEIPT_CONTEXT_KEY = 'rip-market:receipt-context:v1';
export type ReceiptContext = { orderId: string; offerId: string; savedAt: number };

/** Navigation hint only. Never a delivery proof or payment authorization. */
export function readReceiptContext(raw: string | null, referrer: string, now: number): ReceiptContext | null {
  try {
    const value = JSON.parse(raw ?? 'null') as ReceiptContext | null;
    if (!value || !/^[a-f0-9-]{36}$/.test(value.orderId) || !/^[1-9][0-9]{0,19}$/.test(value.offerId)) return null;
    if (!Number.isFinite(value.savedAt) || now < value.savedAt || now - value.savedAt > 30 * 60_000) return null;
    const from = new URL(referrer);
    if (from.origin !== 'https://steamcommunity.com' || from.pathname !== `/tradeoffer/${value.offerId}/`) return null;
    return value;
  } catch { return null; }
}
