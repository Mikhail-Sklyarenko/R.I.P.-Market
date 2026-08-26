import { describe, expect, it } from 'vitest';
import {
  buildCs2InventoryHash,
  CS2_APP_ID,
  countInventoryItemHolders,
  isCs2InventoryActive,
  isSteamInventoryPath,
  parseInventoryAppContext,
  readActiveInventoryAppIdFromDom,
  siteAccountUrl,
  siteSellInventoryUrl,
  listVisibleInventoryItemHolders,
} from './steam-inventory-page.js';
import { resolveInventoryLayerView } from './inventory-layer.js';

describe('isSteamInventoryPath', () => {
  it('matches inventory routes', () => {
    expect(isSteamInventoryPath('/my/inventory/')).toBe(true);
    expect(isSteamInventoryPath('/id/foo/inventory')).toBe(true);
    expect(isSteamInventoryPath('/profiles/7656/inventory/')).toBe(true);
    expect(isSteamInventoryPath('/my/tradeoffers/')).toBe(false);
  });
});

describe('parseInventoryAppContext', () => {
  it('parses CS2 hash forms', () => {
    expect(parseInventoryAppContext('#730_2')).toEqual({
      appId: 730,
      contextId: 2,
    });
    expect(parseInventoryAppContext('#730')).toEqual({
      appId: 730,
      contextId: null,
    });
    expect(parseInventoryAppContext('#!730_2')).toEqual({
      appId: 730,
      contextId: 2,
    });
    expect(parseInventoryAppContext('#440_2').appId).toBe(440);
    expect(parseInventoryAppContext('').appId).toBeNull();
  });
});

describe('isCs2InventoryActive', () => {
  it('requires inventory path and CS2 app', () => {
    expect(
      isCs2InventoryActive({
        pathname: '/id/x/inventory/',
        hash: '#730_2',
      }),
    ).toBe(true);
    expect(
      isCs2InventoryActive({
        pathname: '/id/x/inventory/',
        hash: '#440_2',
      }),
    ).toBe(false);
    expect(
      isCs2InventoryActive({
        pathname: '/tradeoffers/',
        hash: '#730_2',
      }),
    ).toBe(false);
  });

  it('falls back to active game tab in DOM when hash empty', () => {
    const doc = {
      querySelector: (sel: string) => {
        if (sel.includes('games_list_tab')) {
          return { id: 'inventory_link_730', getAttribute: () => null };
        }
        return null;
      },
    };
    expect(
      isCs2InventoryActive({
        pathname: '/my/inventory/',
        hash: '',
        document: doc,
      }),
    ).toBe(true);

    const tf2 = {
      querySelector: () => ({
        id: 'inventory_link_440',
        getAttribute: () => null,
      }),
    };
    expect(
      isCs2InventoryActive({
        pathname: '/my/inventory/',
        hash: '',
        document: tf2,
      }),
    ).toBe(false);
  });
});

describe('readActiveInventoryAppIdFromDom / holders', () => {
  it('reads app id from inventory_link tab', () => {
    expect(
      readActiveInventoryAppIdFromDom({
        querySelector: () => ({
          id: `inventory_link_${CS2_APP_ID}`,
          getAttribute: () => null,
        }),
      }),
    ).toBe(730);
  });

  it('counts item holders', () => {
    expect(
      countInventoryItemHolders({
        querySelectorAll: () => ({ length: 42 }) as NodeListOf<Element>,
      }),
    ).toBe(42);
  });
});

describe('site urls + layer view', () => {
  it('builds site urls from api base', () => {
    expect(siteSellInventoryUrl('https://p2pcs.ru/api/v1')).toBe(
      'https://p2pcs.ru/sell/inventory',
    );
    expect(siteAccountUrl(null)).toContain('/account');
    expect(buildCs2InventoryHash()).toBe('#730_2');
  });

  it('resolves connected vs disconnected copy', () => {
    const connected = resolveInventoryLayerView({
      connected: true,
      sellUrl: 'https://p2pcs.ru/sell/inventory',
      accountUrl: 'https://p2pcs.ru/account',
      itemHolderCount: 10,
    });
    expect(connected.connection).toBe('connected');
    expect(connected.ctaHref).toContain('/sell/inventory');
    expect(connected.body).toMatch(/Safety|Управлять|lock/i);

    const disconnected = resolveInventoryLayerView({
      connected: false,
      sellUrl: 'https://p2pcs.ru/sell/inventory',
      accountUrl: 'https://p2pcs.ru/account',
      itemHolderCount: 0,
    });
    expect(disconnected.connection).toBe('disconnected');
    expect(disconnected.ctaHref).toContain('/account');
    expect(disconnected.body).toMatch(/soft gate|Подключите/i);

    const safe = resolveInventoryLayerView({
      connected: true,
      siteSafeMode: true,
      sellUrl: 'https://p2pcs.ru/sell/inventory',
      accountUrl: 'https://p2pcs.ru/account',
      itemHolderCount: 3,
    });
    expect(safe.connection).toBe('safe_mode');
    expect(safe.body).toMatch(/недоступен|нестабилен|popup/i);
  });
});

describe('listVisibleInventoryItemHolders', () => {
  it('does not pull holders from hidden inventory pages', () => {
    document.body.innerHTML = `
      <div id="inventories">
        <div class="inventory_ctn" style="display: block">
          <div class="inventory_page" style="display: block">
            <div class="itemHolder"><div class="item" id="item730_2_1"></div></div>
            <div class="itemHolder"><div class="item" id="item730_2_2"></div></div>
          </div>
          <div class="inventory_page" style="display: none">
            <div class="itemHolder"><div class="item" id="item730_2_3"></div></div>
            <div class="itemHolder"><div class="item" id="item730_2_4"></div></div>
          </div>
        </div>
      </div>
    `;
    const holders = listVisibleInventoryItemHolders(document);
    expect(holders).toHaveLength(2);
    expect(
      holders.every((h) => h.querySelector('#item730_2_3') == null),
    ).toBe(true);
  });
});
