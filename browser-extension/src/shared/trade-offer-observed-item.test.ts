import { describe, expect, it } from 'vitest';
import {
  detectTradePageRole,
  parseAssetIdFromElement,
  parseObservedItemFromTradePage,
} from './trade-offer-observed-item.js';

describe('trade-offer-observed-item', () => {
  it('detects seller draft pages', () => {
    expect(detectTradePageRole('/tradeoffer/new/')).toBe('seller');
    expect(detectTradePageRole('/tradeoffer/8301234567')).toBe('buyer');
  });

  it('parses asset id from data-assetid', () => {
    const element = document.createElement('div');
    element.setAttribute('data-assetid', '12345678901');
    expect(parseAssetIdFromElement(element)).toBe('12345678901');
  });

  it('parses asset id from steam item element id suffix', () => {
    const element = document.createElement('div');
    element.id = 'asset_730_2_12345678901';
    expect(parseAssetIdFromElement(element)).toBe('12345678901');
  });

  it('parses buyer received item from trade offer page', () => {
    document.body.innerHTML =
      '<div id="them_slots"><div class="item" data-assetid="99887766554" title="AK-47 | Redline (Field-Tested)"></div></div>';

    const observed = parseObservedItemFromTradePage('buyer');
    expect(observed).toEqual({
      assetId: '99887766554',
      marketHashName: 'AK-47 | Redline (Field-Tested)',
    });
  });

  it('parses seller offered item from draft page', () => {
    document.body.innerHTML =
      '<div id="your_slots"><div class="item" data-assetid="11223344556"></div></div>';

    const observed = parseObservedItemFromTradePage('seller');
    expect(observed?.assetId).toBe('11223344556');
  });

  it('parses seller slot item from Steam item730_2_* id without data-assetid', () => {
    document.body.innerHTML =
      '<div id="your_slots"><div class="itemHolder"><div class="item app730 context2" id="item730_2_27123456789" title="MAG-7 | Firestarter (Battle-Scarred)"></div></div></div>';

    const observed = parseObservedItemFromTradePage('seller');
    expect(observed).toEqual({
      assetId: '27123456789',
      marketHashName: 'MAG-7 | Firestarter (Battle-Scarred)',
    });
  });

  it('does not treat inventory-grid items as offer slots', () => {
    document.body.innerHTML =
      '<div id="inventories"><div id="inventory_730_2"><div class="item" id="item730_2_111" data-assetid="111"></div></div></div><div id="your_slots"></div>';

    expect(parseObservedItemFromTradePage('seller')).toBeNull();
  });
});
