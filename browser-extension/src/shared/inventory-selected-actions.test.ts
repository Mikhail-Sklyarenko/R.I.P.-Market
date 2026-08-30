import { describe, expect, it } from 'vitest';
import {
  buildSelectedSellRailModel,
  findVisibleItemActionsRoot,
  findVisibleItemInfoPanel,
  readSelectedCs2ItemFromDom,
} from './inventory-selected-actions.js';

describe('inventory-selected-actions', () => {
  it('reads activeInfo CS2 item', () => {
    document.body.innerHTML = `
      <div class="itemHolder">
        <div class="item activeInfo" id="item730_2_4242" data-market-hash-name="AK-47 | Redline (FT)">
          <img title="AK-47 | Redline (FT)" />
        </div>
      </div>
    `;
    expect(readSelectedCs2ItemFromDom(document)).toEqual({
      assetId: '4242',
      marketHashName: 'AK-47 | Redline (FT)',
      contextId: 2,
    });
  });

  it('falls back to lastClickedAssetId when activeInfo missing', () => {
    document.body.innerHTML = `
      <div class="itemHolder">
        <div class="item" id="730_16_99"><img title="Sticker" /></div>
      </div>
    `;
    expect(
      readSelectedCs2ItemFromDom(document, { lastClickedAssetId: '99' }),
    ).toEqual({
      assetId: '99',
      marketHashName: 'Sticker',
      contextId: 16,
    });
  });

  it('prefers visible market_actions over item_actions', () => {
    document.body.innerHTML = `
      <div id="iteminfo0" style="display: none">
        <div id="iteminfo0_item_market_actions" class="item_market_actions"></div>
      </div>
      <div id="iteminfo1" style="display: block">
        <div id="iteminfo1_item_actions" class="item_actions"></div>
        <div id="iteminfo1_item_market_actions" class="item_market_actions"></div>
      </div>
    `;
    expect(findVisibleItemInfoPanel(document)?.id).toBe('iteminfo1');
    const root = findVisibleItemActionsRoot(document);
    expect(root?.id).toBe('iteminfo1_item_market_actions');
  });

  it('builds rail model for pair / list / hidden', () => {
    expect(
      buildSelectedSellRailModel({
        selected: null,
        connected: true,
        label: 'Продать на R.I.P',
      }).visible,
    ).toBe(false);

    expect(
      buildSelectedSellRailModel({
        selected: { assetId: '1', marketHashName: 'X' },
        connected: false,
        label: 'Продать на R.I.P',
      }),
    ).toMatchObject({ visible: true, kind: 'pair' });

    expect(
      buildSelectedSellRailModel({
        selected: { assetId: '1', marketHashName: 'X' },
        connected: true,
        label: 'Продать на R.I.P',
      }),
    ).toMatchObject({ visible: true, kind: 'list', assetId: '1' });
  });
});
