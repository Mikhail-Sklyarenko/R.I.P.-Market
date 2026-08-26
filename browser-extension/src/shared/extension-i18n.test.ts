import { describe, expect, it } from 'vitest';
import {
  createExtensionT,
  isExtensionLocale,
  normalizeExtensionLocale,
  tx,
} from './extension-i18n.js';

describe('extension-i18n', () => {
  it('normalizes locale tags', () => {
    expect(isExtensionLocale('ru')).toBe(true);
    expect(isExtensionLocale('de')).toBe(false);
    expect(normalizeExtensionLocale('en-US')).toBe('en');
    expect(normalizeExtensionLocale('ru-RU')).toBe('ru');
    expect(normalizeExtensionLocale('fr')).toBe('ru');
  });

  it('translates RU and EN with params', () => {
    expect(tx('ru', 'cta.openDispute')).toBe('Открыть спор');
    expect(tx('en', 'cta.openDispute')).toBe('Open dispute');
    expect(
      tx('en', 'timeout.minutes', { minutes: 4 }),
    ).toBe('~4 min left until auto-dispute');
    expect(tx('ru', 'missing.key')).toBe('missing.key');
  });

  it('switches next-action labels by locale', async () => {
    const { resolveTradeNextAction } = await import('./popup-next-action.js');
    const trade = {
      orderId: 'o1',
      orderShortId: 'o1',
      role: 'buyer' as const,
      orderStatus: 'WAITING_TRADE',
      offerId: '1',
      verificationStatus: 'mismatch' as const,
      checks: [],
      item: {
        marketHashName: 'AK',
        floatValue: null,
        wear: null,
        iconUrl: null,
        assetExternalId: '1',
      },
      counterparty: {
        userId: 'u',
        username: 'x',
        steamId: null,
        personaName: null,
        avatarUrl: null,
      },
      escrow: { holdAmountMinor: '0', status: 'none' as const },
      acknowledgments: {
        sellerAckSent: false,
        buyerPreAccept: false,
        buyerReceived: false,
      },
      nextAction: {
        kind: 'report_issue' as const,
        title: 'x',
        description: 'y',
      },
      siteUrl: 'https://p2pcs.ru/orders/o1',
      amountMinor: '1000',
    };
    expect(resolveTradeNextAction(trade, 'ru').primary.label).toBe(
      'Открыть спор',
    );
    expect(resolveTradeNextAction(trade, 'en').primary.label).toBe(
      'Open dispute',
    );
  });

  it('creates a bound translator', () => {
    const t = createExtensionT('en');
    expect(t('receipt.bought')).toBe('Bought');
    expect(t('receipt.sold')).toBe('Sold');
  });
});
