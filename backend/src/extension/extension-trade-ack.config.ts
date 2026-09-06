import { getPublicSiteOriginFromEnv } from '../common/public-site-url.util';

export function isExtensionTradeAcknowledgmentEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_TRADE_ACKNOWLEDGMENT === 'true';
}

export function extensionActiveTradesLimit(): number {
  const raw = Number(process.env.EXTENSION_ACTIVE_TRADES_LIMIT ?? 10);
  if (!Number.isFinite(raw) || raw < 1) {
    return 10;
  }
  return Math.min(25, Math.floor(raw));
}

/**
 * Single origin for extension order/support hrefs.
 * Never return a comma-joined CORS list (FRONTEND_ORIGIN).
 */
export function getExtensionSiteOrigin(): string {
  return getPublicSiteOriginFromEnv();
}
