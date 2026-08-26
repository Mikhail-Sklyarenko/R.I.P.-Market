/**
 * H6: Website mirror of extension support-bridge wire format.
 * Keep in sync with browser-extension/src/shared/support-bridge.ts
 */

export const SUPPORT_BRIDGE_KIND = 'extension_support' as const;

export type SupportBridgeDealSnapshot = {
  orderId: string;
  orderShortId: string;
  role: 'buyer' | 'seller';
  orderStatus: string;
  phase: string;
  offerId: string | null;
  verificationStatus: string | null;
  errorCode: string | null;
};

export type SupportBridgePack = {
  version: 1;
  kind: typeof SUPPORT_BRIDGE_KIND;
  capturedAt: string;
  extensionVersion: string;
  extensionId: string;
  connected: boolean;
  steamMatch: boolean | null;
  sessionHealthCode: string | null;
  errorCode: string | null;
  siteLinkMode: string | null;
  primaryOrderId: string | null;
  deals: SupportBridgeDealSnapshot[];
};

export function formatSupportBridgeTicketBody(pack: SupportBridgePack): string {
  const lines = [
    '--- R.I.P extension support ---',
    `capturedAt: ${pack.capturedAt}`,
    `extensionVersion: ${pack.extensionVersion}`,
    `extensionId: ${pack.extensionId}`,
    `connected: ${pack.connected ? 'yes' : 'no'}`,
    `steamMatch: ${pack.steamMatch === null ? 'unknown' : pack.steamMatch ? 'yes' : 'no'}`,
    `sessionHealthCode: ${pack.sessionHealthCode ?? '—'}`,
    `errorCode: ${pack.errorCode ?? '—'}`,
    `siteLinkMode: ${pack.siteLinkMode ?? '—'}`,
    `primaryOrderId: ${pack.primaryOrderId ?? '—'}`,
  ];
  if (pack.deals.length === 0) {
    lines.push('deals: (none active)');
  } else {
    lines.push('deals:');
    for (const deal of pack.deals) {
      lines.push(
        `  - #${deal.orderShortId} ${deal.role} status=${deal.orderStatus} phase=${deal.phase} offer=${deal.offerId ?? '—'} verify=${deal.verificationStatus ?? '—'} err=${deal.errorCode ?? '—'}`,
      );
    }
  }
  lines.push('--- end ---');
  lines.push('');
  lines.push(JSON.stringify(pack, null, 2));
  return lines.join('\n');
}

export function decodeSupportBridgePack(
  encoded: string | null | undefined,
): SupportBridgePack | null {
  const raw = encoded?.trim();
  if (!raw) {
    return null;
  }
  try {
    const normalized = raw.replaceAll('-', '+').replaceAll('_', '/');
    const pad =
      normalized.length % 4 === 0
        ? ''
        : '='.repeat(4 - (normalized.length % 4));
    const binary = atob(normalized + pad);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as SupportBridgePack;
    if (
      parsed?.version !== 1 ||
      parsed.kind !== SUPPORT_BRIDGE_KIND ||
      typeof parsed.extensionVersion !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseSupportBridgeFromSearch(
  search: URLSearchParams,
): SupportBridgePack | null {
  return decodeSupportBridgePack(search.get('supportPack'));
}
