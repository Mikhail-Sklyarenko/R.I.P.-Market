import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GUIDED_BUYER_ENABLED_KEY,
  INVENTORY_LAYER_ENABLED_KEY,
  QUIET_NOTIFICATIONS_ENABLED_KEY,
  UI_TRADE_FLOW_ENABLED_KEY,
  USE_DIRECT_TRADE_API_KEY,
  applyTaskUiTradeFlowFlag,
  isExtensionGuidedBuyerEnabled,
  isExtensionInventoryLayerEnabled,
  isExtensionQuietNotificationsEnabled,
  shouldUseUiTradeFlow,
  syncUiTradeFlowFromAuthConfig,
} from './extension-flags.js';

function mockChromeStorage() {
  const localStore: Record<string, unknown> = {};
  const sessionStore: Record<string, unknown> = {};

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[] | Record<string, unknown>) => {
          if (typeof keys === 'string') {
            return { [keys]: localStore[keys] };
          }
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, localStore[key]]));
          }
          return { ...localStore };
        }),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(localStore, values);
        }),
      },
      session: {
        get: vi.fn(async (keys: string | string[]) => {
          if (typeof keys === 'string') {
            return { [keys]: sessionStore[keys] };
          }
          return Object.fromEntries(keys.map((key) => [key, sessionStore[key]]));
        }),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(sessionStore, values);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) {
            delete sessionStore[key];
          }
        }),
      },
    },
  });
}

describe('extension-flags', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockChromeStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          extension: {
            extensionUiTradeFlowEnabled: true,
            extensionTradeAcknowledgmentEnabled: true,
            extensionInventoryLayerEnabled: true,
            extensionGuidedBuyerEnabled: true,
            extensionQuietNotificationsEnabled: true,
          },
        }),
      }),
    );
  });

  it('syncs ui trade flag from auth config', async () => {
    const enabled = await syncUiTradeFlowFromAuthConfig('http://localhost:3000/api/v1');
    expect(enabled).toBe(true);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/v1/auth/config');
    expect(await shouldUseUiTradeFlow()).toBe(true);
  });

  it('syncs I5 UX flags and defaults missing keys to on', async () => {
    expect(await isExtensionInventoryLayerEnabled()).toBe(true);
    expect(await isExtensionGuidedBuyerEnabled()).toBe(true);
    expect(await isExtensionQuietNotificationsEnabled()).toBe(true);

    await syncUiTradeFlowFromAuthConfig('http://localhost:3000/api/v1');
    expect(await isExtensionInventoryLayerEnabled()).toBe(true);
    expect(await isExtensionGuidedBuyerEnabled()).toBe(true);
    expect(await isExtensionQuietNotificationsEnabled()).toBe(true);
  });

  it('honors I5 kill switches from auth config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          extension: {
            extensionUiTradeFlowEnabled: true,
            extensionInventoryLayerEnabled: false,
            extensionGuidedBuyerEnabled: false,
            extensionQuietNotificationsEnabled: false,
          },
        }),
      }),
    );
    await syncUiTradeFlowFromAuthConfig('http://localhost:3000/api/v1');
    expect(await isExtensionInventoryLayerEnabled()).toBe(false);
    expect(await isExtensionGuidedBuyerEnabled()).toBe(false);
    expect(await isExtensionQuietNotificationsEnabled()).toBe(false);
    const stored = await chrome.storage.local.get([
      INVENTORY_LAYER_ENABLED_KEY,
      GUIDED_BUYER_ENABLED_KEY,
      QUIET_NOTIFICATIONS_ENABLED_KEY,
    ]);
    expect(stored[INVENTORY_LAYER_ENABLED_KEY]).toBe(false);
    expect(stored[GUIDED_BUYER_ENABLED_KEY]).toBe(false);
    expect(stored[QUIET_NOTIFICATIONS_ENABLED_KEY]).toBe(false);
  });

  it('treats unset I5 fields in config as on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          extension: { extensionUiTradeFlowEnabled: false },
        }),
      }),
    );
    await syncUiTradeFlowFromAuthConfig('http://localhost:3000/api/v1');
    expect(await isExtensionInventoryLayerEnabled()).toBe(true);
    expect(await isExtensionGuidedBuyerEnabled()).toBe(true);
    expect(await isExtensionQuietNotificationsEnabled()).toBe(true);
  });

  it('prefers emergency direct API over ui trade', async () => {
    await chrome.storage.local.set({ [UI_TRADE_FLOW_ENABLED_KEY]: true });
    await chrome.storage.local.set({ [USE_DIRECT_TRADE_API_KEY]: true });
    expect(await shouldUseUiTradeFlow()).toBe(false);
  });

  it('enables ui trade for task payload override', async () => {
    await applyTaskUiTradeFlowFlag(true);
    expect(await shouldUseUiTradeFlow()).toBe(true);
  });
});
