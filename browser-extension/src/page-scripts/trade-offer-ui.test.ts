import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installSendInterceptor,
  isItemInTradeOffer,
  runAutofillFlow,
  selectItemForTrade,
  setTradeNote,
  submitTradeOffer,
  waitForTradePageReady,
} from './trade-offer-ui.js';

function mockSteamJquery() {
  const handlers: Array<
    (event: unknown, xhr: { responseText?: string }, settings: { url?: string }) => void
  > = [];
  const $J = vi.fn(() => ({
    click: vi.fn(),
    ajaxComplete: (handler: (typeof handlers)[number]) => {
      handlers.push(handler);
    },
    off: vi.fn(),
  }));
  (window as { $J?: typeof $J }).$J = $J;
  return handlers;
}

describe('trade-offer-ui', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    delete (window as { UserYou?: unknown }).UserYou;
    delete (window as { g_ActiveInventory?: unknown }).g_ActiveInventory;
    delete (window as { MoveItemToTrade?: unknown }).MoveItemToTrade;
    delete (window as { $J?: unknown }).$J;
    delete (window as { g_ActiveAppId?: unknown }).g_ActiveAppId;
  });

  it('waitForTradePageReady resolves when Steam globals appear', async () => {
    setTimeout(() => {
      (window as { UserYou?: object; g_ActiveInventory?: object }).UserYou = {
        findAsset: () => null,
      };
      (window as { g_ActiveInventory?: object }).g_ActiveInventory = {};
    }, 50);

    await expect(waitForTradePageReady(500)).resolves.toBeUndefined();
  });

  it('selectItemForTrade calls MoveItemToTrade with DOM element from findAsset', () => {
    const element = document.createElement('div');
    const asset = { appid: 730, contextid: '2', assetid: '123', element };
    const moveItemToTrade = vi.fn();
    (window as { UserYou?: object; MoveItemToTrade?: typeof moveItemToTrade }).UserYou = {
      findAsset: () => asset,
    };
    (window as { MoveItemToTrade?: typeof moveItemToTrade }).MoveItemToTrade = moveItemToTrade;

    selectItemForTrade(730, 2, '123');

    expect(moveItemToTrade).toHaveBeenCalledWith(element);
  });

  it('selectItemForTrade falls back to clicking inventory DOM node', () => {
    document.body.innerHTML = '<div id="asset_730_2_123"></div>';

    selectItemForTrade(730, 2, '123');

    expect(document.getElementById('asset_730_2_123')).toBeTruthy();
  });

  it('isItemInTradeOffer detects item in trade slots', () => {
    document.body.innerHTML =
      '<div id="your_slots"><div class="item" data-assetid="asset-123"></div></div>';
    expect(isItemInTradeOffer('asset-123')).toBe(true);
  });

  it('setTradeNote updates textarea value', () => {
    document.body.innerHTML = '<textarea id="trade_offer_note"></textarea>';
    setTradeNote('R.I.P Market trade');
    expect((document.querySelector('#trade_offer_note') as HTMLTextAreaElement).value).toBe(
      'R.I.P Market trade',
    );
  });

  it('installSendInterceptor captures tradeoffer/new/send ajax response', async () => {
    const handlers = mockSteamJquery();

    const pending = installSendInterceptor(1000);
    handlers[0]?.(
      {},
      {
        responseText: JSON.stringify({
          tradeofferid: '445566',
          needs_mobile_confirmation: false,
        }),
      },
      { url: 'https://steamcommunity.com/tradeoffer/new/send' },
    );

    await expect(pending).resolves.toEqual({
      tradeofferid: '445566',
      needs_mobile_confirmation: false,
    });
  });

  it('submitTradeOffer calls ConfirmTradeOffer when available', () => {
    const confirmTradeOffer = vi.fn();
    (window as { ConfirmTradeOffer?: typeof confirmTradeOffer }).ConfirmTradeOffer =
      confirmTradeOffer;

    submitTradeOffer();

    expect(confirmTradeOffer).toHaveBeenCalled();
  });

  it('runAutofillFlow completes happy path with intercepted send response', async () => {
    vi.stubGlobal('location', {
      ...window.location,
      pathname: '/tradeoffer/new/',
    });

    const element = document.createElement('div');
    const asset = { appid: 730, contextid: '2', assetid: 'asset-123', element };
    const moveItemToTrade = vi.fn(() => {
      document.body.innerHTML +=
        '<div id="your_slots"><div class="item" data-assetid="asset-123"></div></div>' +
        '<textarea id="trade_offer_note"></textarea>';
    });
    const confirmTradeOffer = vi.fn();
    (window as { UserYou?: object; g_ActiveInventory?: object; MoveItemToTrade?: typeof moveItemToTrade; ConfirmTradeOffer?: typeof confirmTradeOffer }).UserYou = {
      findAsset: () => asset,
    };
    (window as { g_ActiveInventory?: object }).g_ActiveInventory = {};
    (window as { MoveItemToTrade?: typeof moveItemToTrade }).MoveItemToTrade = moveItemToTrade;
    (window as { ConfirmTradeOffer?: typeof confirmTradeOffer }).ConfirmTradeOffer =
      confirmTradeOffer;

    document.body.innerHTML = '<textarea id="trade_offer_note"></textarea>';

    const handlers = mockSteamJquery();

    const pending = runAutofillFlow({
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-123' },
      note: 'R.I.P Market trade',
    });

    await vi.waitFor(() => {
      expect(handlers.length).toBeGreaterThan(0);
    });

    handlers[0]?.(
      {},
      {
        responseText: JSON.stringify({
          tradeofferid: '55667788',
          needs_mobile_confirmation: false,
        }),
      },
      { url: 'https://steamcommunity.com/tradeoffer/new/send' },
    );

    await expect(pending).resolves.toEqual({
      ok: true,
      offerId: '55667788',
      confirmPending: false,
      strError: undefined,
    });
    expect(moveItemToTrade).toHaveBeenCalledWith(element);
    expect(confirmTradeOffer).toHaveBeenCalled();
  });

  it('runAutofillFlow maps trade hold strError from Steam 400 response', async () => {
    vi.stubGlobal('location', {
      ...window.location,
      pathname: '/tradeoffer/new/',
    });

    const element = document.createElement('div');
    const asset = { appid: 730, contextid: '2', assetid: 'asset-123', element };
    (window as { UserYou?: object; g_ActiveInventory?: object; MoveItemToTrade?: () => void; ConfirmTradeOffer?: () => void }).UserYou = {
      findAsset: () => asset,
    };
    (window as { g_ActiveInventory?: object }).g_ActiveInventory = {};
    (window as { MoveItemToTrade?: () => void }).MoveItemToTrade = vi.fn(() => {
      document.body.innerHTML +=
        '<div id="your_slots"><div class="item" data-assetid="asset-123"></div></div>' +
        '<textarea id="trade_offer_note"></textarea>';
    });
    (window as { ConfirmTradeOffer?: () => void }).ConfirmTradeOffer = vi.fn();
    document.body.innerHTML = '<textarea id="trade_offer_note"></textarea>';

    const handlers = mockSteamJquery();

    const pending = runAutofillFlow({
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-123' },
    });

    await vi.waitFor(() => {
      expect(handlers.length).toBeGreaterThan(0);
    });

    handlers[0]?.(
      {},
      {
        responseText: JSON.stringify({
          strError: 'You have a trade hold and cannot trade',
        }),
      },
      { url: 'https://steamcommunity.com/tradeoffer/new/send' },
    );

    await expect(pending).resolves.toEqual({
      ok: false,
      error: 'You have a trade hold and cannot trade',
      strError: 'You have a trade hold and cannot trade',
    });
  });
});
