import { describe, expect, it } from 'vitest';
import {
  isCs2InventoryVisibleOnTradeOffer,
  resolveSellerTradeOfferGate,
} from './seller-trade-offer-gate.js';

describe('seller-trade-offer-gate', () => {
  it('asks for CS2 when inventory picker is empty', () => {
    document.body.innerHTML =
      '<div id="appselect"><div>Выберите инвентарь</div></div><div id="your_slots"></div>';
    expect(isCs2InventoryVisibleOnTradeOffer(document)).toBe(false);
    expect(resolveSellerTradeOfferGate({ root: document })).toBe('need_cs2');
  });

  it('asks to add the skin when CS2 inventory is visible but slots are empty', () => {
    document.body.innerHTML = `
      <div id="inventories">
        <div id="inventory_730_2">
          <div class="itemHolder"><div class="item" id="item730_2_999"></div></div>
        </div>
      </div>
      <div id="your_slots"></div>`;
    expect(isCs2InventoryVisibleOnTradeOffer(document)).toBe(true);
    expect(resolveSellerTradeOfferGate({ root: document })).toBe('need_item');
  });

  it('is ready when the deal item is in Your items', () => {
    document.body.innerHTML = `
      <div id="inventories">
        <div id="inventory_730_2">
          <div class="itemHolder"><div class="item" id="item730_2_999"></div></div>
        </div>
      </div>
      <div id="your_slots">
        <div class="itemHolder"><div class="item" id="item730_2_27123456789"></div></div>
      </div>`;
    expect(resolveSellerTradeOfferGate({ root: document })).toBe('item_ready');
  });
});
