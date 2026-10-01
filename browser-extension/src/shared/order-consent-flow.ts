/** Website requests can only open trusted extension UI, never grant consent. */
export function consentOrderFromSender(
  orderId: unknown,
  senderUrl?: string,
): string | null {
  if (
    typeof orderId !== "string" ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(orderId)
  )
    return null;
  try {
    const url = new URL(senderUrl ?? "");
    return url.origin === "https://p2pcs.ru" &&
      url.pathname === `/orders/${orderId}`
      ? orderId
      : null;
  } catch {
    return null;
  }
}

export function isOrderConsentPage(
  sender: { id?: string; url?: string },
  orderId: unknown,
): boolean {
  if (sender.id !== chrome.runtime.id || typeof orderId !== "string")
    return false;
  try {
    const url = new URL(sender.url ?? "");
    return (
      url.href.split("?")[0] ===
        chrome.runtime.getURL("popup/order-consent.html") &&
      url.searchParams.get("orderId") === orderId
    );
  } catch {
    return false;
  }
}

export async function prepareAndDispatch(
  orderId: string,
  consent: boolean,
  prepare: (id: string) => Promise<Record<string, unknown>>,
  poll: () => Promise<void>,
): Promise<Record<string, unknown>> {
  if (!consent) throw new Error("CONSENT_REQUIRED");
  const result = await prepare(orderId);
  if (
    result.baselineReady === true &&
    result.reasonCode === "WAITING_FOR_OFFER"
  ) {
    await poll();
  }
  return result;
}
