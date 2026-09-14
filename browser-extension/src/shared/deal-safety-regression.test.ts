import { runTradeOfferAutofillInMainWorld } from './trade-offer-ui-runner.js';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CreateOfferOrchestrator } from '@rip-market/extension-orchestrator';
import { parseInventoryPage } from './steam-inventory-loader.js';
import {
  cacheSentOffer,
  resolvePriorSuccessfulSend,
} from './trade-offer-sent-cache.js';
import { MessageSteamOfferAdapter } from '../adapters/message-steam-offer-adapter.js';
import { isItemInTradeOffer } from '../page-scripts/trade-offer-ui.js';
import { parseSteamSendResponse } from './trade-offer-send-errors.js';
import { detectSteamOfferPageLifecycle } from './steam-offer-page-lifecycle.js';
const seller = '76561198000000000';
const url = 'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc';
function task(extra: any = {}) {
  return {
    id: 'task1',
    orderId: 'order1',
    tradeOperationId: 'op1',
    type: 'create_offer',
    executionPhase: null,
    attemptCount: 0,
    payload: {
      expectedAssetId: 'asset1',
      marketHashName: 'Skin',
      sellerSteamId: seller,
      buyerTradeUrl: url,
      ...extra,
    },
  } as any;
}
function adapter(items: any[]) {
  return {
    warmTradePage: vi.fn(async () => true),
    resolveSessionSteamId: vi.fn(async () => seller),
    loadSellerInventory: vi.fn(async () => ({ items })),
    draftOffer: vi.fn(async () => ({ ok: true, draftId: 'draft-task1' })),
    sendOffer: vi.fn(async () => ({ ok: true, offerId: '123456789' })),
  } as any;
}
let stores: any;
beforeEach(() => {
  stores = { session: {}, local: {} };
  let storage: any = {};
  for (const area of ['session', 'local'])
    storage[area] = {
      get: async (key: any) =>
        Object.fromEntries(
          (Array.isArray(key) ? key : [key]).map((k) => [k, stores[area][k]]),
        ),
      set: async (p: any) => Object.assign(stores[area], p),
      remove: async (keys: any) =>
        (Array.isArray(keys) ? keys : [keys]).forEach(
          (k) => delete stores[area][k],
        ),
    };
  vi.stubGlobal('chrome', { storage });
  document.body.innerHTML = '';
});
afterEach(() => vi.unstubAllGlobals());
describe('Deal safety regressions', () => {
  it('exact asset remains valid when float metadata is unavailable', async () => {
    const items = parseInventoryPage({
      success: 1,
      assets: [{ assetid: 'asset1', classid: 'c', instanceid: 'i' }],
      descriptions: [
        { classid: 'c', instanceid: 'i', market_hash_name: 'Skin' },
      ],
    });
    const steam = adapter(items);
    const report = vi.fn(async () => ({ terminal: false }));
    await new CreateOfferOrchestrator(steam, { report }).processTask(
      task({ expectedFloatValue: '0.123' }),
    );
    expect(items[0].floatValue).toBeNull();
    expect(steam.draftOffer).toHaveBeenCalled();
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'OFFER_SENT' }),
    );
  });
  it('missing exact asset is never substituted', async () => {
    const steam = adapter([{ assetId: 'different', marketHashName: 'Skin' }]);
    await new CreateOfferOrchestrator(steam, {
      report: async () => ({ terminal: false }),
    }).processTask(task());
    expect(steam.draftOffer).not.toHaveBeenCalled();
  });
  it('new task ignores stale asset-only offer', async () => {
    await cacheSentOffer(
      'draft-old',
      { ok: true, offerId: '123456789', confirmPending: false },
      { assetId: 'asset1' },
    );
    stores.local['rip:intercepted-offer:asset1'].capturedAt =
      '2020-01-01T00:00:00Z';
    stores.session = {};
    expect(
      await resolvePriorSuccessfulSend({
        draftId: 'draft-new',
        assetId: 'asset1',
      }),
    ).toBeNull();
  });
  it('enabled button alone is not proof of item selection', () => {
    document.body.innerHTML = '<button id="trade_confirmbtn">Confirm</button>';
    expect(isItemInTradeOffer('missing-asset')).toBe(false);
  });
  it('confirmation error is not classified as successful', () => {
    expect(
      parseSteamSendResponse({
        strError:
          'There was an error confirming your trade. Please try again later.',
      }),
    ).toMatchObject({ ok: false });
  });
  it('Steam generic error remains an invalid page for independent verification', () => {
    document.body.innerHTML =
      '<div class="error_ctn">Oh nooooooes! Some kind of error has occurred.</div>';
    expect(detectSteamOfferPageLifecycle()).toMatchObject({
      lifecycle: 'invalid',
      offerStatusHint: null,
    });
  });
  it('browser restart retains durable draft', async () => {
    const steam: any = {
      navigateToTradePage: vi.fn(async () => 42),
      sendTradeOffer: vi.fn(async () => ({
        ok: true,
        offerId: '123456789',
        confirmPending: false,
      })),
    };
    const a = new MessageSteamOfferAdapter(steam);
    await a.draftOffer({
      buyerTradeUrl: url,
      item: { assetId: 'asset1' },
      taskId: 'task1',
    });
    stores.session = {};
    expect(await a.sendOffer('draft-task1')).toMatchObject({
      ok: true,
      offerId: '123456789',
    });
    expect(steam.sendTradeOffer).toHaveBeenCalledOnce();
  });
  it('failed submit authorization prevents starting Steam send', async () => {
    const executeScript = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ result: { ok: true } }])
      .mockResolvedValueOnce([{ result: { ok: true } }])
      .mockResolvedValueOnce([{ result: { ok: true, offerId: '123456789' } }]);
    (chrome as any).tabs = { get: async () => ({ url }) };
    (chrome as any).scripting = { executeScript };
    await expect(
      runTradeOfferAutofillInMainWorld(
        42,
        { buyerTradeUrl: url, assetId: 'asset1' } as any,
        {
          onOfferSubmitted: async () => {
            throw new Error('backend offline');
          },
        },
      ),
    ).rejects.toThrow('backend offline');
    expect(executeScript).toHaveBeenCalledTimes(2);
  });
  it('different attempts use different event keys', async () => {
    const steam = adapter([]);
    const report = vi.fn(async () => ({ terminal: false }));
    const o = new CreateOfferOrchestrator(steam, { report });
    await o.processTask(task());
    await o.processTask({ ...task(), attemptCount: 1 });
    const failures = report.mock.calls
      .map((c: any) => c[0])
      .filter((p: any) => p.phase === 'OFFER_FAILED');
    expect(failures).toHaveLength(2);
    expect(failures[0].idempotencyKey).not.toBe(failures[1].idempotencyKey);
  });
});
