import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfferErrorCode } from '@rip-market/extension-orchestrator';
import { MessageSteamOfferAdapter } from './message-steam-offer-adapter.js';
import type { SteamCommunityClient } from '../shared/steam-community-client.js';

function createMockSteamClient(
  overrides: Partial<SteamCommunityClient> = {},
): SteamCommunityClient {
  return {
    resolveSessionSteamId: vi.fn().mockResolvedValue('76561198000000000'),
    loadInventory: vi.fn().mockResolvedValue([]),
    navigateToTradePage: vi.fn().mockResolvedValue(42),
    sendTradeOffer: vi.fn().mockResolvedValue({
      ok: true,
      offerId: '99887766',
      confirmPending: false,
    }),
    ...overrides,
  } as unknown as SteamCommunityClient;
}

describe('MessageSteamOfferAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it('sendOffer invokes progress hooks before Steam send', async () => {
    const onItemSelected = vi.fn().mockResolvedValue(undefined);
    const onOfferSubmitted = vi.fn().mockResolvedValue(undefined);
    const steam = createMockSteamClient();
    const adapter = new MessageSteamOfferAdapter(steam);
    vi.mocked(chrome.storage.session.get).mockImplementation(async () => ({
      'rip:draft:draft-task-1': {
        buyerTradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
        item: { assetId: 'asset-1', marketHashName: 'AK-47 | Redline' },
      },
    }));

    await adapter.sendOffer('draft-task-1', {
      onItemSelected,
      onOfferSubmitted,
    });

    expect(onItemSelected).toHaveBeenCalledWith({
      assetId: 'asset-1',
      marketHashName: 'AK-47 | Redline',
      floatValue: null,
    });
    expect(onOfferSubmitted).toHaveBeenCalled();
    expect(steam.sendTradeOffer).toHaveBeenCalled();
  });

  it('sendOffer maps trade hold errors from UI flow', async () => {
    const steam = createMockSteamClient({
      sendTradeOffer: vi.fn().mockResolvedValue({
        ok: false,
        error: 'Offer send failed',
        strError: 'You cannot trade due to a trade hold',
      }),
    });
    const adapter = new MessageSteamOfferAdapter(steam);
    vi.mocked(chrome.storage.session.get).mockImplementation(async () => ({
      'rip:draft:draft-task-1': {
        buyerTradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
        item: { assetId: 'asset-1' },
      },
    }));

    const result = await adapter.sendOffer('draft-task-1');

    expect(result).toEqual({
      ok: false,
      code: OfferErrorCode.TRADE_HOLD_BLOCKED,
      message:
        'Offer send failed — You cannot trade due to a trade hold',
    });
  });

  it('sendOffer maps HTTP 400 style Steam errors', async () => {
    const steam = createMockSteamClient({
      sendTradeOffer: vi.fn().mockResolvedValue({
        ok: false,
        error: 'Steam returned HTTP 400',
        strError: 'There was an error sending your trade offer. Please try again later.',
      }),
    });
    const adapter = new MessageSteamOfferAdapter(steam);
    vi.mocked(chrome.storage.session.get).mockImplementation(async () => ({
      'rip:draft:draft-task-1': {
        buyerTradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
        item: { assetId: 'asset-1' },
      },
    }));

    const result = await adapter.sendOffer('draft-task-1');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe(OfferErrorCode.OFFER_SEND_FAILED);
  });

  it('draftOffer navigates to trade page and stores draft for resume', async () => {
    const steam = createMockSteamClient();
    const adapter = new MessageSteamOfferAdapter(steam);

    const result = await adapter.draftOffer({
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-1' },
      taskId: 'task-1',
    });

    expect(result).toEqual({ ok: true, draftId: 'draft-task-1' });
    expect(steam.navigateToTradePage).toHaveBeenCalledWith(
      'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
    );
    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      'rip:draft:draft-task-1': {
        buyerTradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
        item: { assetId: 'asset-1' },
      },
    });
  });

  it('sendOffer uses UI flow result from SteamCommunityClient', async () => {
    const steam = createMockSteamClient();
    const adapter = new MessageSteamOfferAdapter(steam);
    vi.mocked(chrome.storage.session.get).mockImplementation(async () => ({
      'rip:draft:draft-task-1': {
        buyerTradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
        item: { assetId: 'asset-1' },
      },
    }));

    const result = await adapter.sendOffer('draft-task-1');

    expect(steam.sendTradeOffer).toHaveBeenCalledWith({
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-1' },
    });
    expect(result).toEqual({
      ok: true,
      offerId: '99887766',
      confirmPending: false,
    });
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('rip:draft:draft-task-1');
  });

  it('sendOffer maps strError from UI flow to OfferErrorCode', async () => {
    const steam = createMockSteamClient({
      sendTradeOffer: vi.fn().mockResolvedValue({
        ok: false,
        error: 'Item missing from inventory',
        strError: 'The item is no longer in your inventory',
      }),
    });
    const adapter = new MessageSteamOfferAdapter(steam);
    vi.mocked(chrome.storage.session.get).mockImplementation(async () => ({
      'rip:draft:draft-task-1': {
        buyerTradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
        item: { assetId: 'asset-1' },
      },
    }));

    const result = await adapter.sendOffer('draft-task-1');

    expect(result).toEqual({
      ok: false,
      code: OfferErrorCode.ITEM_MISSING,
      message: 'Item missing from inventory — The item is no longer in your inventory',
    });
    expect(chrome.storage.session.remove).not.toHaveBeenCalled();
  });
});
