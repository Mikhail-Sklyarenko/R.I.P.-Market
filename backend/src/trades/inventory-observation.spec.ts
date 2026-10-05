import {
  mapInventoryDelivery,
  type AssetObservation,
  type InventoryBaseline,
} from './inventory-observation';
import { steamReceiptComplete } from '../providers/trade/steam-delivery-proof';
import { decideDeliveryVerification } from './delivery-verification-decision';
const original: AssetObservation = {
  assetId: '50586848789',
  contextId: '2',
  appId: 730,
  classId: '123',
  instanceId: '0',
  marketHashName: 'Dual Berettas | BorDeux (Battle-Scarred)',
  floatValue: '0.812345',
  paintSeed: 123,
  stickers: [],
};
const beforeTime = '2026-09-29T04:00:00Z',
  afterTime = '2026-09-29T04:03:00Z';
const baseline: InventoryBaseline = {
  original,
  seller: { fetchedAt: beforeTime, assets: [original] },
  buyer: { fetchedAt: beforeTime, assets: [] },
};
const seller = { fetchedAt: afterTime, assets: [] };
const destination = {
  ...original,
  assetId: '60000000000',
  contextId: '16' as const,
};
const buyer = (assets: AssetObservation[]) => ({
  fetchedAt: afterTime,
  assets,
});
it.each(['2', '16'] as const)(
  'control trade: complete receipt without new IDs maps unique context %s gain',
  (contextId) => {
    const context = {
      sellerSteamId: '76561198195181115',
      buyerSteamId: '76561198655632881',
      assetId: original.assetId,
    };
    expect(
      steamReceiptComplete(
        {
          tradeid: '744938690018816549',
          status: 3,
          steamid_other: context.buyerSteamId,
          assets_given: [
            {
              appid: 730,
              contextid: '2',
              assetid: original.assetId,
              amount: '1',
            },
          ],
        },
        '744938690018816549',
        context,
      ),
    ).toBe(true);
    const mapped = mapInventoryDelivery(
      baseline,
      seller,
      buyer([{ ...destination, contextId }]),
      original.assetId,
    );
    expect(mapped).toMatchObject({
      result: 'confirmed',
      method: 'INVENTORY_DELTA',
    });
    expect(
      decideDeliveryVerification({
        engineEnabled: true,
        shadowMode: false,
        hasOfferId: true,
        offerStatus: 'accepted',
        inventoryDelta: mapped.result,
        buyerAckReceived: false,
        timedOut: false,
        rateLimited: false,
        checkCount: 1,
        failMode: 'SAFE',
      }).action,
    ).toBe('WAIT'); // A mapping alone is not persisted receipt authority.
  },
);
it('receipt mapping needs no reconstructed pre-trade snapshot', () => {
  expect(
    mapInventoryDelivery(null, seller, buyer([destination]), original.assetId, {
      assetId: destination.assetId,
      contextId: '16',
    }).method,
  ).toBe('STEAM_RECEIPT');
});
it('two candidates are ambiguous', () =>
  expect(
    mapInventoryDelivery(
      baseline,
      seller,
      buyer([destination, { ...destination, assetId: '60000000001' }]),
      original.assetId,
    ).result,
  ).toBe('ambiguous'));
it('zero candidates wait', () =>
  expect(
    mapInventoryDelivery(baseline, seller, buyer([]), original.assetId).result,
  ).toBe('pending'));
it('seller still holding blocks success', () =>
  expect(
    mapInventoryDelivery(
      baseline,
      { ...seller, assets: [original] },
      buyer([destination]),
      original.assetId,
    ).result,
  ).toBe('seller_still_holds'));
it('old buyer item is not a gain', () =>
  expect(
    mapInventoryDelivery(
      { ...baseline, buyer: { ...baseline.buyer, assets: [destination] } },
      seller,
      buyer([destination]),
      original.assetId,
    ).result,
  ).toBe('pending'));
it('context migration of an existing item is not a gain', () =>
  expect(
    mapInventoryDelivery(
      { ...baseline, buyer: { ...baseline.buyer, assets: [destination] } },
      seller,
      buyer([{ ...destination, contextId: '2' }]),
      original.assetId,
    ).result,
  ).toBe('pending'));
it.each([
  { floatValue: null },
  { paintSeed: null },
  { classId: 'other' },
  { instanceId: 'other' },
  { stickers: [{ name: 'other' }] },
])('incomplete or mismatching fingerprint %j cannot verify', (patch) =>
  expect(
    mapInventoryDelivery(
      baseline,
      seller,
      buyer([{ ...destination, ...patch }]),
      original.assetId,
    ).result,
  ).toBe('pending'),
);
it('no baseline fails closed', () =>
  expect(
    mapInventoryDelivery(null, seller, buyer([destination]), original.assetId)
      .result,
  ).toBe('unknown'));
it('stale observations cannot verify', () =>
  expect(
    mapInventoryDelivery(
      baseline,
      baseline.seller,
      buyer([destination]),
      original.assetId,
    ).result,
  ).not.toBe('confirmed'));
