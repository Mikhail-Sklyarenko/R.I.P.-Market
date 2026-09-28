import {
  receivedAssetFromSteamReceipt,
  steamOfferMatchesOrder,
} from './steam-delivery-proof';

export const context = {
  sellerSteamId: '76561198195181115',
  buyerSteamId: '76561198655632881',
  assetId: '50586823960',
};
const item = {
  appid: 730,
  contextid: '2',
  assetid: context.assetId,
  amount: '1',
};
const offer = {
  is_our_offer: true,
  accountid_other: 695367153,
  items_to_give: [item],
  items_to_receive: [],
};
const tradeId = '744938690018752002';
const receipt = {
  tradeid: tradeId,
  status: 3,
  steamid_other: context.buyerSteamId,
  assets_given: [{ ...item, new_assetid: '53954582039', new_contextid: '2' }],
  assets_received: [],
};

describe('Steam proof binding', () => {
  it('binds the exact seller, buyer, item and quantity', () => {
    expect(steamOfferMatchesOrder(offer, context, context.sellerSteamId)).toBe(
      true,
    );
    expect(receivedAssetFromSteamReceipt(receipt, tradeId, context)).toBe(
      '53954582039',
    );
  });
  it.each([undefined, context.buyerSteamId, '76561198000000000'])(
    'rejects a credential owned by %s',
    (owner) => {
      expect(steamOfferMatchesOrder(offer, context, owner)).toBe(false);
    },
  );
  it.each([
    { is_our_offer: false },
    { accountid_other: 1 },
    { accountid_other: '695367153' },
    { items_to_give: [item, item] },
    { items_to_receive: [item] },
    { items_to_give: [{ ...item, assetid: '999' }] },
    { items_to_give: [{ ...item, appid: 440 }] },
    { items_to_give: [{ ...item, amount: '2' }] },
    { items_to_give: [{ ...item, contextid: '16' }] },
    { items_to_give: [{ ...item, missing: true }] },
  ])('rejects mismatched offer %j', (patch) => {
    expect(
      steamOfferMatchesOrder(
        { ...offer, ...patch },
        context,
        context.sellerSteamId,
      ),
    ).toBe(false);
  });
  it.each([
    null,
    {},
    { ...receipt, tradeid: Number(tradeId) },
    { ...receipt, tradeid: '1' },
    { ...receipt, steamid_other: context.sellerSteamId },
    { ...receipt, assets_received: [item] },
    {
      ...receipt,
      assets_given: [receipt.assets_given[0], receipt.assets_given[0]],
    },
  ])('rejects unrelated or malformed receipt %j', (value) => {
    expect(receivedAssetFromSteamReceipt(value, tradeId, context)).toBeNull();
  });
  it.each([0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 99])(
    'rejects incomplete/rollback status %s',
    (status) => {
      expect(
        receivedAssetFromSteamReceipt({ ...receipt, status }, tradeId, context),
      ).toBeNull();
    },
  );
  it.each([
    { new_contextid: '16' },
    { new_assetid: '0' },
    { new_assetid: 53954582039 },
    { rollback_new_assetid: '123' },
    { rollback_new_contextid: '2' },
    { assetid: '999' },
  ])('rejects unsafe mapping %j', (patch) => {
    expect(
      receivedAssetFromSteamReceipt(
        {
          ...receipt,
          assets_given: [{ ...receipt.assets_given[0], ...patch }],
        },
        tradeId,
        context,
      ),
    ).toBeNull();
  });
});
