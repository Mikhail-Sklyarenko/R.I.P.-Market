import { boundDeliveryProof } from './durable-delivery-proof';
import { getSteamProtectionMs } from '../settlement/settlement-hold.config';

const anchors = {
  orderId: 'fixture-order',
  offerId: '100',
  originalAssetId: '200',
  sellerSteamId: '76561198000000101',
  buyerSteamId: '76561198000000102',
  tradeBinding: 'p2pcs:fixture',
};
const proof = {
  ...anchors,
  version: 3,
  authority: 'STEAM_RECEIPT',
  tradeId: '300',
  receiptStatus: 3,
  offerState: 3,
  bindingVerified: true,
  verifiedAt: '2026-01-01T00:00:00Z',
  protectionUntil: '2026-01-09T00:00:00Z',
};
it('accepts a full receipt proof without destination fields', () =>
  expect(boundDeliveryProof(proof, anchors)).toEqual(proof));
it.each([
  { orderId: 'other' },
  { offerId: '101' },
  { originalAssetId: '201' },
  { sellerSteamId: anchors.buyerSteamId },
  { buyerSteamId: anchors.sellerSteamId },
  { tradeId: 'invalid' },
  { receiptStatus: 10 },
  { offerState: 2 },
  { bindingVerified: false },
  { tradeBinding: 'p2pcs:other' },
  { authority: 'PAGE_OBSERVED' },
  { verifiedAt: 'invalid' },
  { protectionUntil: '2026-01-08T00:00:00Z' },
])('rejects invalid or mismatching immutable anchors %j', (patch) =>
  expect(boundDeliveryProof({ ...proof, ...patch }, anchors)).toBeNull(),
);
it('accepts complete legacy v2 but rejects a partial legacy row', () => {
  const legacy = {
    ...proof,
    version: 2,
    destinationAssetId: '400',
    destinationContextId: '16',
    mappingMethod: 'INVENTORY_DELTA',
  };
  expect(boundDeliveryProof(legacy, anchors)).not.toBeNull();
  expect(
    boundDeliveryProof({ ...legacy, destinationAssetId: undefined }, anchors),
  ).toBeNull();
});
it('uses canonical minimum eight days even if a shorter duration is configured', () => {
  const before = process.env.SETTLEMENT_HOLD_DAYS;
  try {
    process.env.SETTLEMENT_HOLD_DAYS = '1';
    expect(getSteamProtectionMs()).toBe(8 * 86400000);
    process.env.SETTLEMENT_HOLD_DAYS = '10';
    expect(getSteamProtectionMs()).toBe(10 * 86400000);
  } finally {
    if (before === undefined) delete process.env.SETTLEMENT_HOLD_DAYS;
    else process.env.SETTLEMENT_HOLD_DAYS = before;
  }
});
