import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamCommunityClient } from './steam-community-client.js';
import {
  UI_TRADE_FLOW_ENABLED_KEY,
  USE_DIRECT_TRADE_API_KEY,
} from './extension-flags.js';

vi.mock('./steam-tab-utils.js', () => ({
  navigateTab: vi.fn().mockResolvedValue(undefined),
  waitForTabLoad: vi.fn().mockResolvedValue(undefined),
  waitForTabUrl: vi.fn().mockResolvedValue(true),
}));

vi.mock('./steam-trade-offer.js', () => ({
  sendTradeOfferViaPageScript: vi.fn().mockResolvedValue({
    ok: true,
    offerId: 'api-offer',
    confirmPending: false,
  }),
}));

vi.mock('./trade-offer-ui-runner.js', () => ({
  isTabOnBuyerTradeUrl: vi.fn().mockReturnValue(true),
  runTradeOfferAutofillInMainWorld: vi.fn().mockResolvedValue({
    ok: true,
    offerId: 'ui-offer',
    confirmPending: true,
  }),
}));

function mockChromeStorage(local: Record<string, unknown> = {}) {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[] | Record<string, unknown>) => {
          if (typeof keys === 'string') {
            return { [keys]: local[keys] };
          }
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, local[key]]));
          }
          return { ...local };
        }),
      },
      session: {
        get: vi.fn(async () => ({})),
      },
    },
    tabs: {
      get: vi.fn().mockResolvedValue({
        id: 1,
        url: 'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      }),
      query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://steamcommunity.com/tradeoffer/new' }]),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn(),
      onUpdated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    scripting: {
      executeScript: vi.fn(),
    },
  });
}

describe('SteamCommunityClient.sendTradeOffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChromeStorage();
  });

  it('uses legacy API when ui trade flag is off', async () => {
    const { sendTradeOfferViaPageScript } = await import('./steam-trade-offer.js');
    const client = new SteamCommunityClient();
    const result = await client.sendTradeOffer({
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-1' },
    });

    expect(sendTradeOfferViaPageScript).toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      offerId: 'api-offer',
      confirmPending: false,
    });
  });

  it('uses main-world UI runner when ui trade flag is enabled', async () => {
    mockChromeStorage({ [UI_TRADE_FLOW_ENABLED_KEY]: true });
    const { runTradeOfferAutofillInMainWorld } = await import('./trade-offer-ui-runner.js');
    const { sendTradeOfferViaPageScript } = await import('./steam-trade-offer.js');
    const client = new SteamCommunityClient();
    const result = await client.sendTradeOffer({
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-1' },
    });

    expect(runTradeOfferAutofillInMainWorld).toHaveBeenCalled();
    expect(sendTradeOfferViaPageScript).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      offerId: 'ui-offer',
      confirmPending: true,
    });
  });

  it('uses direct API when USE_DIRECT_TRADE_API flag is enabled', async () => {
    mockChromeStorage({
      [UI_TRADE_FLOW_ENABLED_KEY]: true,
      [USE_DIRECT_TRADE_API_KEY]: true,
    });

    const { sendTradeOfferViaPageScript } = await import('./steam-trade-offer.js');
    const { runTradeOfferAutofillInMainWorld } = await import('./trade-offer-ui-runner.js');
    const client = new SteamCommunityClient();
    const result = await client.sendTradeOffer({
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-1' },
    });

    expect(sendTradeOfferViaPageScript).toHaveBeenCalled();
    expect(runTradeOfferAutofillInMainWorld).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      offerId: 'api-offer',
      confirmPending: false,
    });
  });

  it('falls back to UI autofill when API returns HTTP 400 empty', async () => {
    const { sendTradeOfferViaPageScript } = await import('./steam-trade-offer.js');
    const { runTradeOfferAutofillInMainWorld } = await import('./trade-offer-ui-runner.js');
    vi.mocked(sendTradeOfferViaPageScript).mockResolvedValueOnce({
      ok: false,
      error: 'Steam returned empty response (HTTP 400)',
    });

    const client = new SteamCommunityClient();
    const result = await client.sendTradeOffer({
      buyerTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      item: { assetId: 'asset-1' },
    });

    expect(sendTradeOfferViaPageScript).toHaveBeenCalled();
    expect(runTradeOfferAutofillInMainWorld).toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      offerId: 'ui-offer',
      confirmPending: true,
    });
  });
});
