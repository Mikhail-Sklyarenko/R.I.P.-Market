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
      '<div class="tradeoffer_items_ctn"><div class="item" data-assetid="99887766554" title="AK-47 | Redline (Field-Tested)"></div></div>';

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
});
