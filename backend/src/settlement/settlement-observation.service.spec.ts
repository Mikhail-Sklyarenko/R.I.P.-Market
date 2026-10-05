import { SettlementObservationService } from './settlement-observation.service';
import { observeSteamInventory } from '../trades/inventory-observation';
import type { Prisma } from '@prisma/client';
jest.mock('../trades/inventory-observation', () => ({
  ...jest.requireActual('../trades/inventory-observation'),
  observeSteamInventory: jest.fn(),
}));

describe('optional settlement contradictions', () => {
  const original = {
    assetId: '123',
    contextId: '2',
    appId: 730,
    classId: '10',
    instanceId: '0',
    marketHashName: 'fixture',
    floatValue: '0.123',
    paintSeed: 12,
    stickers: [],
  };
  const proof = {
    version: 3,
    authority: 'STEAM_RECEIPT',
    orderId: 'order',
    offerId: '456',
    tradeId: '789',
    originalAssetId: '123',
    sellerSteamId: '76561198000000001',
    buyerSteamId: '76561198000000002',
    receiptStatus: 3,
    offerState: 3,
    bindingVerified: true,
    tradeBinding: 'p2pcs:test',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    protectionUntil: '2026-01-09T00:00:00.000Z',
  };
  let tx: {
    tradeOperation: { findUnique: jest.Mock; update: jest.Mock };
    tradePollEvent: { create: jest.Mock };
    tradeVerificationSnapshot: { findFirst: jest.Mock; create: jest.Mock };
  };
  let provider: { verifyTradeReceipt: jest.Mock };
  let service: SettlementObservationService;
  beforeEach(() => {
    tx = {
      tradeOperation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'op',
          orderId: 'order',
          externalOfferId: '456',
          expectedAssetId: '123',
          tradeBinding: 'p2pcs:test',
          deliveryProof: proof,
          verificationStage: 'PROTECTION',
          inventoryBaseline: {
            original,
            seller: {
              fetchedAt: '2025-12-31T00:00:00.000Z',
              assets: [original],
            },
            buyer: { fetchedAt: '2025-12-31T00:00:00.000Z', assets: [] },
          },
          order: {
            status: 'SETTLEMENT_HOLD',
            seller: { steamId: proof.sellerSteamId },
            buyer: { steamId: proof.buyerSteamId },
          },
        }),
        update: jest.fn(),
      },
      tradePollEvent: { create: jest.fn() },
      tradeVerificationSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    provider = {
      verifyTradeReceipt: jest.fn().mockResolvedValue({
        status: 'unknown',
        reasonCode: 'STEAM_RECEIPT_UNAVAILABLE',
      }),
    };
    service = new SettlementObservationService({} as never, provider as never);
    (observeSteamInventory as jest.Mock)
      .mockReset()
      .mockRejectedValue(new Error('private'));
  });
  it('records unavailable observation without mutating proof or blocking', async () => {
    await service.observe('order', tx as unknown as Prisma.TransactionClient);
    expect(tx.tradePollEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: 'UNAVAILABLE', error: null }),
    });
    expect(tx.tradeOperation.update).toHaveBeenCalledWith({
      where: { id: 'op' },
      data: { lastCheckedAt: expect.any(Date) },
    });
  });
  it.each([
    { reversalDetected: true },
    { identityConflict: true },
    { tradeId: '999' },
  ])('blocks explicit receipt contradiction %j', async (signal) => {
    provider.verifyTradeReceipt.mockResolvedValue({
      status: 'unknown',
      ...signal,
    });
    await service.observe('order', tx as unknown as Prisma.TransactionClient);
    expect(tx.tradeOperation.update).toHaveBeenCalledWith({
      where: { id: 'op' },
      data: expect.objectContaining({ verificationStage: 'MANUAL_REVIEW' }),
    });
  });
  it('strong seller reappearance blocks, name alone does not', async () => {
    (observeSteamInventory as jest.Mock).mockResolvedValue({
      fetchedAt: '2026-01-02T00:00:00.000Z',
      assets: [{ ...original, assetId: '999' }],
    });
    await service.observe('order', tx as unknown as Prisma.TransactionClient);
    expect(tx.tradeOperation.update).toHaveBeenLastCalledWith({
      where: { id: 'op' },
      data: expect.objectContaining({ failReasonCode: 'REVERSAL_SUSPECTED' }),
    });
    (observeSteamInventory as jest.Mock).mockResolvedValue({
      fetchedAt: '2026-01-02T00:00:00.000Z',
      assets: [{ ...original, floatValue: null }],
    });
    await service.observe('order', tx as unknown as Prisma.TransactionClient);
    expect(tx.tradeOperation.update).toHaveBeenLastCalledWith({
      where: { id: 'op' },
      data: { lastCheckedAt: expect.any(Date) },
    });
  });
  it('stores a unique buyer mapping separately without modifying proof', async () => {
    (observeSteamInventory as jest.Mock)
      .mockResolvedValueOnce({
        fetchedAt: '2026-01-02T00:00:00.000Z',
        assets: [],
      })
      .mockResolvedValueOnce({
        fetchedAt: '2026-01-02T00:00:00.000Z',
        assets: [{ ...original, assetId: '999', contextId: '16' }],
      });
    await service.observe('order', tx as unknown as Prisma.TransactionClient);
    expect(tx.tradeVerificationSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'SETTLEMENT_SUPPLEMENTARY_MAPPING',
        payload: expect.objectContaining({ assetId: '999', contextId: '16' }),
      }),
    });
    expect(tx.tradeOperation.update.mock.calls[0][0].data).not.toHaveProperty(
      'deliveryProof',
    );
  });
  it('does not expose transport secrets', async () => {
    provider.verifyTradeReceipt.mockRejectedValue(
      new Error('access_token=private-secret'),
    );
    await service.observe('order', tx as unknown as Prisma.TransactionClient);
    expect(JSON.stringify(tx.tradePollEvent.create.mock.calls)).not.toContain(
      'private-secret',
    );
  });
});
