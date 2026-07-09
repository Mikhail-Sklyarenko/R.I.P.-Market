import { DeliveryVerificationEngineService } from './delivery-verification-engine.service';
import { SteamTradeRateLimitError } from '../providers/trade/steam-trade.provider';

describe('DeliveryVerificationEngineService', () => {
  const tradesService = {
    verifyOffer: jest.fn(),
  };
  const inventoryDelta = {
    verify: jest.fn(),
  };
  const service = new DeliveryVerificationEngineService(
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

  it('evaluates dual-signal confirm when engine enabled', async () => {
    process.env.ENABLE_DELIVERY_VERIFICATION_ENGINE = 'true';
    tradesService.verifyOffer.mockResolvedValue({ status: 'accepted' });
    inventoryDelta.verify.mockResolvedValue('confirmed');

    const result = await service.evaluate(operation as never);

    expect(result.decision.action).toBe('CONFIRM');
    expect(result.evidence.reasonCode).toBe('DUAL_SIGNAL_CONFIRMED');
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
});
