import { DeliveryVerificationEngineService } from './delivery-verification-engine.service';
import { SteamTradeRateLimitError } from '../providers/trade/steam-trade.provider';
import { InventoryVerificationRateLimitError } from './trade-inventory-delta.service';

describe('DeliveryVerificationEngineService', () => {
  const prisma = {
    tradeOperation: { findUnique: jest.fn(), updateMany: jest.fn() },
    steamMappingLease: { deleteMany: jest.fn() },
    tradePollEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    tradeAcknowledgment: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const tradesService = {
    verifyOffer: jest.fn(),
  };
  const inventoryDelta = {
    verify: jest.fn(),
  };
  const service = new DeliveryVerificationEngineService(
    prisma as never,
    tradesService as never,
    inventoryDelta as never,
  );

  const operation = {
    id: 'trade-1',
    orderId: 'order-1',
    externalOfferId: '8301234567',
    expectedAssetId: 'asset-1',
    verificationMode: 'STEAM_POLL',
    checkCount: 2,
    order: {
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      createdAt: new Date(),
      lot: {
        inventoryAsset: {
          assetExternalId: 'asset-1',
          itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
        },
      },
      buyer: { id: 'buyer-1', steamId: 'buyer-steam' },
      seller: { id: 'seller-1', steamId: 'seller-steam' },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_DELIVERY_VERIFICATION_ENGINE;
    service.clearBackoff('order-1');
  });

  it('accepted plus inventory alone cannot confirm without durable receipt', async () => {
    process.env.ENABLE_DELIVERY_VERIFICATION_ENGINE = 'true';
    tradesService.verifyOffer.mockResolvedValue({ status: 'accepted' });
    inventoryDelta.verify.mockResolvedValue('confirmed');

    const result = await service.evaluate(operation as never);

    expect(result.decision.action).toBe('WAIT');
    expect(tradesService.verifyOffer).toHaveBeenCalledWith(
      operation.externalOfferId,
      {
        sellerSteamId: 'seller-steam',
        buyerSteamId: 'buyer-steam',
        assetId: 'asset-1',
      },
    );
    expect(result.evidence.reasonCode).toBe('INVENTORY_PENDING');
    expect(inventoryDelta.verify).toHaveBeenCalledWith(
      'seller-1',
      'buyer-1',
      'seller-steam',
      'buyer-steam',
      'asset-1',
      'AK-47 | Redline (Field-Tested)',
      expect.objectContaining({
        force: true,
        orderCreatedAt: operation.order.createdAt,
      }),
    );
  });
  it('retains the safe provider reason while waiting without authorizing delivery', async () => {
    tradesService.verifyOffer.mockResolvedValue({
      status: 'unknown',
      reasonCode: 'STEAM_RECEIPT_MAPPING_UNAVAILABLE',
    });
    inventoryDelta.verify.mockResolvedValue('pending');
    const result = await service.evaluate(operation as never);
    expect(result.decision.action).toBe('WAIT');
    expect(result.decision.reasonCode).toBe(
      'STEAM_RECEIPT_MAPPING_UNAVAILABLE',
    );
  });

  it('backs off when inventory is throttled instead of exhausting delivery checks', async () => {
    tradesService.verifyOffer.mockResolvedValue({ status: 'unknown' });
    inventoryDelta.verify.mockRejectedValueOnce(
      new InventoryVerificationRateLimitError(),
    );
    const result = await service.evaluate(operation as never);
    expect(result.decision.action).toBe('BACKOFF');
    expect(result.decision.reasonCode).toBe('rate_limited');
  });

  it('does not promote a client-observed acceptance to authoritative Steam acceptance', async () => {
    process.env.ENABLE_DELIVERY_VERIFICATION_ENGINE = 'true';
    tradesService.verifyOffer.mockResolvedValue({ status: 'unknown' });
    inventoryDelta.verify.mockResolvedValue('confirmed');
    prisma.tradePollEvent.findFirst.mockResolvedValueOnce({
      offerStatus: 'accepted',
    });

    const result = await service.evaluate(operation as never);

    expect(result.offerStatus).toBe('unknown');
    expect(result.decision.action).not.toBe('CONFIRM');
  });

  it('passes the server-verified destination asset only for accepted exchanges', async () => {
    inventoryDelta.verify.mockResolvedValue('pending');
    for (const status of ['accepted', 'unknown']) {
      tradesService.verifyOffer.mockResolvedValue({
        status,
        receivedAssetId: 'new-asset',
      });
      await service.evaluate(operation as never);
      expect(inventoryDelta.verify).toHaveBeenLastCalledWith(
        'seller-1',
        'buyer-1',
        'seller-steam',
        'buyer-steam',
        'asset-1',
        'AK-47 | Redline (Field-Tested)',
        expect.objectContaining({
          receivedAssetId: status === 'accepted' ? 'new-asset' : undefined,
        }),
      );
    }
  });

  it('returns BACKOFF decision on Steam 429', async () => {
    process.env.ENABLE_DELIVERY_VERIFICATION_ENGINE = 'true';
    tradesService.verifyOffer.mockRejectedValue(new SteamTradeRateLimitError());

    const result = await service.evaluate(operation as never);

    expect(result.decision.action).toBe('BACKOFF');
  });

  it('applies exponential backoff windows per order', () => {
    process.env.TRADE_POLL_BACKOFF_MS = '1000';
    process.env.TRADE_POLL_BACKOFF_MAX_MS = '10000';
    const first = service.registerRateLimitBackoff('order-1');
    const second = service.registerRateLimitBackoff('order-1');
    expect(second).toBeGreaterThanOrEqual(first);
    expect(service.isInBackoff('order-1')).toBe(true);
  });
  it.each(['unknown', 'rate_limit', 'conflict', 'different_receipt'] as const)(
    'persisted authority handles %s without trusting inventory',
    async (scenario) => {
      const current = {
        ...operation,
        expectedAssetId: '123',
        checkCount: 99,
        order: {
          ...operation.order,
          seller: { id: 'seller-1', steamId: '76561198000000101' },
          buyer: { id: 'buyer-1', steamId: '76561198000000102' },
        },
        deliveryProof: {
          version: 3,
          authority: 'STEAM_RECEIPT',
          orderId: operation.orderId,
          offerId: operation.externalOfferId,
          tradeId: '456',
          originalAssetId: '123',
          sellerSteamId: '76561198000000101',
          buyerSteamId: '76561198000000102',
          receiptStatus: 3,
          offerState: 3,
          bindingVerified: false,
          verifiedAt: new Date().toISOString(),
          protectionUntil: new Date(Date.now() + 8 * 86400000).toISOString(),
        },
      };
      prisma.tradeOperation.findUnique.mockResolvedValue(current);
      if (scenario === 'rate_limit')
        tradesService.verifyOffer.mockRejectedValue(
          new SteamTradeRateLimitError(),
        );
      else
        tradesService.verifyOffer.mockResolvedValue(
          scenario === 'different_receipt'
            ? { status: 'accepted', receiptVerified: true, tradeId: '999' }
            : { status: 'unknown', identityConflict: scenario === 'conflict' },
        );
      const result = await service.evaluate(current as never);
      expect(result.decision.action).toBe(
        ['conflict', 'different_receipt'].includes(scenario)
          ? 'MANUAL_REVIEW'
          : 'CONFIRM',
      );
      expect(inventoryDelta.verify).not.toHaveBeenCalled();
      expect(result.inventoryDelta).toBeNull();
      if (result.decision.action === 'CONFIRM')
        expect(result.evidence.receiptProofPersisted).toBe(true);
    },
  );
});
