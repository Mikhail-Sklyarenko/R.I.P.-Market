import { describe, expect, it } from 'vitest';
import {
  evaluateCheckedInventoryAsset,
  evaluatePrelistSafety,
  isListableMarketHashName,
  PRELIST_SOFT_GATE_MESSAGE,
} from './inventory-prelist-safety.js';

describe('inventory-prelist-safety', () => {
  const steamOk = {
    tradable: true,
    marketable: true,
    tradeLockUntil: null as string | null,
    marketHashName: 'AK-47 | Redline (Field-Tested)',
  };

  it('soft-gates when extension is disconnected', () => {
    const result = evaluatePrelistSafety({
      connected: false,
      steam: steamOk,
    });
    expect(result.softGate).toBe(true);
    expect(result.canList).toBe(false);
    expect(result.message).toBe(PRELIST_SOFT_GATE_MESSAGE);
  });

  it('blocks list in H4 site safe mode while still paired', () => {
    const result = evaluatePrelistSafety({
      connected: true,
      siteSafeMode: true,
      steam: steamOk,
    });
    expect(result.canList).toBe(false);
    expect(result.reason).toBe('site_offline');
    expect(result.softGate).toBe(true);
  });

  it('blocks active trade task and in-deal before list', () => {
    expect(
      evaluatePrelistSafety({
        connected: true,
        steam: steamOk,
        platform: { hasActiveTradeTask: true, orderUrl: 'https://p2pcs.ru/o/1' },
      }).reason,
    ).toBe('active_trade_task');

    expect(
      evaluatePrelistSafety({
        connected: true,
        steam: steamOk,
        platform: { inActiveDeal: true },
      }).reason,
    ).toBe('in_deal');
  });

  it('blocks trade-lock / not tradable / non-listable type', () => {
    expect(
      evaluatePrelistSafety({
        connected: true,
        steam: {
          ...steamOk,
          tradeLockUntil: '2099-01-01T00:00:00.000Z',
        },
      }).reason,
    ).toBe('trade_locked');

    expect(
      evaluatePrelistSafety({
        connected: true,
        steam: { ...steamOk, tradable: false },
      }).reason,
    ).toBe('not_tradable');

    expect(
      evaluatePrelistSafety({
        connected: true,
        steam: {
          ...steamOk,
          marketHashName: '5 Year Veteran Coin',
        },
      }).reason,
    ).toBe('not_listable_type');
  });

  it('allows clean connected listable item', () => {
    expect(
      evaluatePrelistSafety({ connected: true, steam: steamOk }).canList,
    ).toBe(true);
    expect(isListableMarketHashName('Fever Case')).toBe(true);
  });

  it('validates checked inventory asset before create', () => {
    expect(
      evaluateCheckedInventoryAsset({
        status: 'AVAILABLE',
        tradable: true,
        marketable: true,
        tradeLockUntil: null,
        itemDefinition: { marketHashName: 'Fever Case' },
      }).ok,
    ).toBe(true);

    expect(
      evaluateCheckedInventoryAsset({
        status: 'LISTED',
        tradable: true,
        marketable: true,
        itemDefinition: { marketHashName: 'Fever Case' },
      }).ok,
    ).toBe(false);

    expect(
      evaluateCheckedInventoryAsset({
        status: 'AVAILABLE',
        tradable: true,
        marketable: true,
        tradeLockUntil: '2099-01-01T00:00:00.000Z',
        itemDefinition: { marketHashName: 'Fever Case' },
      }).error,
    ).toMatch(/trade-lock/i);
  });
});
