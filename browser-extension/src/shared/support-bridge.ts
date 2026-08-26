/**
 * H6: Support bridge — one-click debug pack for support.
 * Wire format is shared with the website (`supportPack` query param).
 */

export const SUPPORT_BRIDGE_KIND = 'extension_support' as const;

export type SupportBridgeDealSnapshot = {
  orderId: string;
  orderShortId: string;
  role: 'buyer' | 'seller';
  orderStatus: string;
  /** Catalog “phase”: nextAction.kind or verification status. */
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
  /** true = Steam matches pair; false = mismatch; null = unknown / disconnected. */
  steamMatch: boolean | null;
  sessionHealthCode: string | null;
  /** Primary support-facing code (health or deal). */
  errorCode: string | null;
  siteLinkMode: string | null;
  primaryOrderId: string | null;
  deals: SupportBridgeDealSnapshot[];
};

export type SupportBridgeTradeLike = {
  orderId: string;
  orderShortId?: string | null;
  role: 'buyer' | 'seller';
  orderStatus: string;
  offerId?: string | null;
  verificationStatus?: string | null;
  nextAction?: { kind?: string | null } | null;
  checks?: Array<{ key: string; passed: boolean }>;
};

export function resolveSteamMatch(params: {
  connected: boolean;
  sessionHealthCode: string | null | undefined;
}): boolean | null {
  if (!params.connected) {
    return null;
  }
  const code = params.sessionHealthCode ?? null;
  if (code === 'STEAM_ACCOUNT_MISMATCH') {
    return false;
  }
  if (
    code === 'EXT_DISCONNECTED' ||
    code === 'SESSION_REVOKED' ||
    code == null ||
    code === ''
  ) {
    return null;
  }
  return true;
}

export function resolveSupportBridgePhase(
  trade: SupportBridgeTradeLike,
): string {
  const kind = trade.nextAction?.kind?.trim();
  if (kind) {
    return kind;
  }
  if (trade.verificationStatus) {
    return `verify:${trade.verificationStatus}`;
  }
  return trade.orderStatus || 'unknown';
}

export function resolveDealErrorCode(
  trade: SupportBridgeTradeLike,
): string | null {
  if (trade.verificationStatus === 'mismatch') {
    return 'VERIFY_MISMATCH';
  }
  const kind = trade.nextAction?.kind;
  if (kind === 'report_issue') {
    return 'REPORT_ISSUE';
  }
  if (kind === 'send_manual') {
    return 'SEND_MANUAL';
  }
  const failed = trade.checks?.find((check) => !check.passed);
  return failed?.key ?? null;
}

export function pickSupportBridgeDeals(
  trades: SupportBridgeTradeLike[],
  limit = 5,
): SupportBridgeDealSnapshot[] {
  const ranked = [...trades].sort((a, b) => {
    const score = (trade: SupportBridgeTradeLike): number => {
      if (trade.verificationStatus === 'mismatch') return 0;
      const kind = trade.nextAction?.kind;
      if (kind === 'report_issue') return 1;
      if (kind === 'confirm_guard' || kind === 'accept_in_steam') return 2;
      if (kind === 'send_manual') return 3;
      return 9;
    };
    return score(a) - score(b);
  });

  return ranked.slice(0, limit).map((trade) => ({
    orderId: trade.orderId,
    orderShortId: (trade.orderShortId ?? trade.orderId).slice(0, 8),
    role: trade.role,
    orderStatus: trade.orderStatus,
    phase: resolveSupportBridgePhase(trade),
    offerId: trade.offerId?.trim() || null,
    verificationStatus: trade.verificationStatus ?? null,
    errorCode: resolveDealErrorCode(trade),
  }));
}

export function buildSupportBridgePack(params: {
  extensionVersion: string;
  extensionId: string;
  connected: boolean;
  sessionHealthCode: string | null;
  healthSupportCode?: string | null;
  siteLinkMode?: string | null;
  trades?: SupportBridgeTradeLike[];
  capturedAt?: string;
}): SupportBridgePack {
  const deals = pickSupportBridgeDeals(params.trades ?? []);
  const primary = deals[0] ?? null;
  const errorCode =
    params.healthSupportCode?.trim() ||
    params.sessionHealthCode?.trim() ||
    primary?.errorCode ||
    null;

  return {
    version: 1,
    kind: SUPPORT_BRIDGE_KIND,
    capturedAt: params.capturedAt ?? new Date().toISOString(),
    extensionVersion: params.extensionVersion,
    extensionId: params.extensionId,
    connected: params.connected,
    steamMatch: resolveSteamMatch({
      connected: params.connected,
      sessionHealthCode: params.sessionHealthCode,
    }),
    sessionHealthCode: params.sessionHealthCode,
    errorCode,
    siteLinkMode: params.siteLinkMode ?? null,
    primaryOrderId: primary?.orderId ?? null,
    deals,
  };
}

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

export function encodeSupportBridgePack(pack: SupportBridgePack): string {
  const json = JSON.stringify(pack);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
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

export function buildSupportBridgeUrl(params: {
  siteOrigin: string;
  pack: SupportBridgePack;
}): string {
  const origin = params.siteOrigin.replace(/\/$/, '');
  const query = new URLSearchParams();
  query.set('topic', 'extension');
  if (params.pack.primaryOrderId) {
    query.set('dealId', params.pack.primaryOrderId);
  }
  const primaryOffer = params.pack.deals.find(
    (deal) => deal.orderId === params.pack.primaryOrderId,
  )?.offerId;
  if (primaryOffer) {
    query.set('offerId', primaryOffer);
  }
  query.set('supportPack', encodeSupportBridgePack(params.pack));
  return `${origin}/support?${query.toString()}`;
}

export function siteOriginFromApiBaseUrl(apiBaseUrl?: string | null): string {
  if (!apiBaseUrl) {
    return 'https://p2pcs.ru';
  }
  return apiBaseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}
