import { proofDeadline, supportsProofWindow } from './settlement-proof-policy';

describe('canonical settlement proof deadline', () => {
  const anchors = {
    orderId: 'order-test',
    offerId: '123',
    originalAssetId: '456',
    sellerSteamId: '76561198000000001',
    buyerSteamId: '76561198000000002',
    tradeBinding: 'p2pcs:test',
  };
  const proof = {
    ...anchors,
    version: 3,
    authority: 'STEAM_RECEIPT',
    tradeId: '789',
    receiptStatus: 3,
    offerState: 3,
    bindingVerified: true,
    verifiedAt: '2026-10-04T14:40:08.629Z',
    protectionUntil: '2026-10-12T14:40:08.629Z',
  };
  const originalTimezone = process.env.TZ;
  afterEach(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });

  it.each(['UTC', 'Europe/Moscow'])(
    'uses the same absolute instant in %s',
    (timezone) => {
      process.env.TZ = timezone;
      expect(proofDeadline(proof, anchors)).toBe(
        Date.parse('2026-10-12T14:40:08.629Z'),
      );
      expect(supportsProofWindow(proof, anchors)).toBe(true);
    },
  );

  it.each([
    { version: 4 },
    { authority: 'CLIENT' },
    { bindingVerified: false },
    { orderId: 'other' },
    { offerId: '999' },
    { originalAssetId: '999' },
    { sellerSteamId: anchors.buyerSteamId },
    { buyerSteamId: anchors.sellerSteamId },
    { tradeBinding: 'other' },
    { tradeId: '' },
    { receiptStatus: 2 },
    { offerState: 2 },
    { verifiedAt: '2026-10-04T14:40:08.629' },
    { protectionUntil: '2026-10-12T14:40:08.628Z' },
    { protectionUntil: '2026-10-12T14:40:08.629' },
    { verifiedAt: '2026-02-30T14:40:08.629Z' },
  ])('rejects corrupted or insufficient proof %j', (change) => {
    expect(proofDeadline({ ...proof, ...change }, anchors)).toBeNull();
    expect(supportsProofWindow({ ...proof, ...change }, anchors)).toBe(false);
  });

  it('requires a current binding and a proof', () => {
    expect(proofDeadline(null, anchors)).toBeNull();
    expect(
      proofDeadline(proof, { ...anchors, tradeBinding: undefined }),
    ).toBeNull();
  });

  it('keeps v2 readable without authorizing the proof-window policy', () => {
    const legacy = {
      ...proof,
      version: 2,
      destinationAssetId: '111',
      destinationContextId: '16',
      mappingMethod: 'INVENTORY_DELTA',
    };
    expect(proofDeadline(legacy, anchors)).not.toBeNull();
    expect(supportsProofWindow(legacy, anchors)).toBe(false);
  });
});
