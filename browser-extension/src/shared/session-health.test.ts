import { describe, expect, it } from 'vitest';
import {
  buildSessionHealth,
  offerErrorToSessionHealthCode,
} from './session-health.js';

describe('session-health', () => {
  it('builds actionable CTAs for mismatch / private / 429 / revoked', () => {
    expect(buildSessionHealth({ code: 'STEAM_ACCOUNT_MISMATCH' }).ctaUrl).toContain(
      'steamcommunity.com/login',
    );
    expect(buildSessionHealth({ code: 'INVENTORY_PRIVATE' }).ctaUrl).toContain(
      'edit/settings',
    );
    expect(buildSessionHealth({ code: 'INVENTORY_RATE_LIMITED' }).supportCode).toBe(
      'INVENTORY_RATE_LIMITED',
    );
    expect(buildSessionHealth({ code: 'SESSION_REVOKED' }).ctaUrl).toContain(
      '/account',
    );
    expect(buildSessionHealth({ code: 'STEAM_COOKIE_EXPIRED' }).ctaLabel).toBeTruthy();
  });

  it('maps offer error codes to session health codes', () => {
    expect(offerErrorToSessionHealthCode('STEAM_ACCOUNT_MISMATCH')).toBe(
      'STEAM_ACCOUNT_MISMATCH',
    );
    expect(offerErrorToSessionHealthCode('INVENTORY_PRIVATE')).toBe(
      'INVENTORY_PRIVATE',
    );
    expect(offerErrorToSessionHealthCode('SESSION_REVOKED')).toBe('SESSION_REVOKED');
    expect(offerErrorToSessionHealthCode('OFFER_SEND_FAILED')).toBeNull();
  });
});
