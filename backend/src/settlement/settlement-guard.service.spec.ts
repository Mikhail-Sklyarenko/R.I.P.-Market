import { OrderStatus, TradeOperationStatus } from '@prisma/client';
import { SettlementGuardService } from './settlement-guard.service';
import {
  getMaxDailyOrders,
  getMaxDailyVolumeMinor,
  getMaxOrderMinor,
  isRealSettlementEnabled,
} from './settlement.config';
import { isLiveVerificationMode } from '../trades/trade-verification.config';

jest.mock('./settlement.config', () => {
  const actual = jest.requireActual<typeof import('./settlement.config')>(
    './settlement.config',
  );
  return {
    ...actual,
    isRealSettlementEnabled: jest.fn(() => true),
    getEnvAllowlistSteamIds: jest.fn(() => new Set(['76561198000000001'])),
    getMaxOrderMinor: jest.fn(() => 50_000n),
    getMaxDailyOrders: jest.fn(() => 3),
    getMaxDailyVolumeMinor: jest.fn(() => 150_000n),
    utcDayKey: jest.fn(() => '2026-06-28'),
  };
});

jest.mock('../trades/trade-verification.config', () => ({
  isLiveVerificationMode: jest.fn(() => true),
}));

describe('SettlementGuardService', () => {
  let prisma: {
    settlementAllowlistEntry: { findUnique: jest.Mock };
    settlementDailyStats: { findUnique: jest.Mock };
    ledgerEntry: { findFirst: jest.Mock };
    tradeOperation: { findUnique: jest.Mock };
  };
  let service: SettlementGuardService;
  const verifyTradeOffer = jest.fn();

  const baseOrder = {
    id: 'order-1',
    status: OrderStatus.TRADE_CONFIRMED,
    amountMinor: 10_000n,
    buyer: { steamId: '76561198000000001' },
    seller: { steamId: '76561198000000002' },
    tradeOperation: { status: TradeOperationStatus.CONFIRMED },
  };

  beforeEach(() => {
    prisma = {
      settlementAllowlistEntry: { findUnique: jest.fn() },
      settlementDailyStats: { findUnique: jest.fn() },
      ledgerEntry: { findFirst: jest.fn().mockResolvedValue(null) },
      tradeOperation: {
        findUnique: jest.fn().mockResolvedValue({
          externalOfferId: '9391832342',
          expectedAssetId: '50586823960',
        }),
      },
    };
    verifyTradeOffer.mockReset();
    verifyTradeOffer.mockResolvedValue({
      status: 'accepted',
      receivedAssetId: '53954582039',
    });
    service = new SettlementGuardService(
      prisma as never,
      { verifyTradeOffer } as never,
    );
    (isRealSettlementEnabled as jest.Mock).mockReturnValue(true);
    (isLiveVerificationMode as jest.Mock).mockReturnValue(true);
    (getMaxOrderMinor as jest.Mock).mockReturnValue(50_000n);
    (getMaxDailyVolumeMinor as jest.Mock).mockReturnValue(150_000n);
  });

  it.each(['unknown', 'pending', 'declined', 'expired', 'needs_confirmation'])(
    'keeps held funds when the fresh Steam status is %s',
    async (status) => {
      prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
        enabled: true,
      });
      verifyTradeOffer.mockResolvedValue({ status });
      expect(
        await service.canSettle({
          ...baseOrder,
          status: OrderStatus.SETTLEMENT_HOLD,
        }),
      ).toMatchObject({ allowed: false, code: 'STEAM_RECHECK_UNAVAILABLE' });
    },
  );

  it('requires receipt evidence even when the fresh offer is accepted', async () => {
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
      enabled: true,
    });
    verifyTradeOffer.mockResolvedValue({ status: 'accepted' });
    expect(
      await service.canSettle({
        ...baseOrder,
        status: OrderStatus.SETTLEMENT_HOLD,
      }),
    ).toMatchObject({ allowed: false, code: 'STEAM_RECHECK_UNAVAILABLE' });
  });

  it('rechecks the stored offer and original asset with the order participants', async () => {
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
      enabled: true,
    });
    expect(
      await service.canSettle({
        ...baseOrder,
        status: OrderStatus.SETTLEMENT_HOLD,
      }),
    ).toEqual({ allowed: true });
    expect(verifyTradeOffer).toHaveBeenCalledWith('9391832342', {
      sellerSteamId: baseOrder.seller.steamId,
      buyerSteamId: baseOrder.buyer.steamId,
      assetId: '50586823960',
    });
  });

  it('does not expose credential-bearing network errors', async () => {
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
      enabled: true,
    });
    verifyTradeOffer.mockRejectedValue(
      new Error('https://example.invalid/?key=secret'),
    );
    const result = await service.canSettle({
      ...baseOrder,
      status: OrderStatus.SETTLEMENT_HOLD,
    });
    expect(result).toMatchObject({
      allowed: false,
      code: 'STEAM_RECHECK_UNAVAILABLE',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it.each([false, true])(
    'rechecks immutable delta proof without demanding new_assetid; reversal=%s',
    async (reversalDetected) => {
      prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
        enabled: true,
      });
      prisma.tradeOperation.findUnique.mockResolvedValue({
        externalOfferId: '9394782030',
        expectedAssetId: '50586848789',
        deliveryProof: {
          version: 2,
          offerId: '9394782030',
          tradeId: '744938690018816549',
          originalAssetId: '50586848789',
          sellerSteamId: baseOrder.seller.steamId,
          buyerSteamId: baseOrder.buyer.steamId,
          protectionUntil: new Date(Date.now() - 1000).toISOString(),
        },
      });
      verifyTradeOffer.mockResolvedValue({
        status: 'accepted',
        receiptVerified: true,
        tradeId: '744938690018816549',
        reversalDetected,
      });
      expect(
        (
          await service.canSettle({
            ...baseOrder,
            status: OrderStatus.SETTLEMENT_HOLD,
          })
        ).allowed,
      ).toBe(!reversalDetected);
    },
  );

  it('immutable proof cannot authorize an early release', async () => {
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
      enabled: true,
    });
    prisma.tradeOperation.findUnique.mockResolvedValue({
      externalOfferId: '9394782030',
      expectedAssetId: '50586848789',
      deliveryProof: {
        version: 2,
        offerId: '9394782030',
        tradeId: '744938690018816549',
        originalAssetId: '50586848789',
        sellerSteamId: baseOrder.seller.steamId,
        buyerSteamId: baseOrder.buyer.steamId,
        protectionUntil: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    verifyTradeOffer.mockResolvedValue({
      status: 'accepted',
      receiptVerified: true,
      tradeId: '744938690018816549',
    });
    expect(
      (
        await service.canSettle({
          ...baseOrder,
          status: OrderStatus.SETTLEMENT_HOLD,
        })
      ).allowed,
    ).toBe(false);
  });

  it('blocks when the persisted trade reference is absent', async () => {
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
      enabled: true,
    });
    prisma.tradeOperation.findUnique.mockResolvedValue(null);
    expect(
      await service.canSettle({
        ...baseOrder,
        status: OrderStatus.SETTLEMENT_HOLD,
      }),
    ).toMatchObject({ allowed: false, code: 'STEAM_RECHECK_UNAVAILABLE' });
    expect(verifyTradeOffer).not.toHaveBeenCalled();
  });

  it('allows when both parties are env-allowlisted', async () => {
    const order = {
      ...baseOrder,
      seller: { steamId: '76561198000000001' },
    };
    prisma.settlementDailyStats.findUnique.mockResolvedValue({
      orderCount: 0,
      volumeMinor: 0n,
    });

    const result = await service.canSettle(order);
    expect(result).toEqual({ allowed: true });
  });

  it('blocks non-allowlisted seller', async () => {
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue(null);

    const result = await service.canSettle(baseOrder);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('SELLER_NOT_ALLOWLISTED');
    }
  });

  it('blocks when daily order limit reached', async () => {
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
      enabled: true,
      maxOrderMinor: null,
    });
    prisma.settlementDailyStats.findUnique.mockResolvedValue({
      orderCount: getMaxDailyOrders(),
      volumeMinor: 0n,
    });

    const result = await service.canSettle({
      ...baseOrder,
      seller: { steamId: '76561198000000001' },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('DAILY_ORDER_LIMIT');
    }
  });

  it('blocks when order amount exceeds limit', async () => {
    (getMaxOrderMinor as jest.Mock).mockReturnValue(5_000n);
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
      enabled: true,
      maxOrderMinor: null,
    });
    prisma.settlementDailyStats.findUnique.mockResolvedValue({
      orderCount: 0,
      volumeMinor: 0n,
    });

    const result = await service.canSettle({
      ...baseOrder,
      amountMinor: 10_000n,
      seller: { steamId: '76561198000000001' },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('ORDER_AMOUNT_EXCEEDS_LIMIT');
    }
  });

  it('blocks when not in live verification mode', async () => {
    (isLiveVerificationMode as jest.Mock).mockReturnValue(false);

    const result = await service.canSettle(baseOrder);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('NOT_LIVE_MODE');
    }
  });

  it('blocks when daily volume limit would be exceeded', async () => {
    (getMaxDailyVolumeMinor as jest.Mock).mockReturnValue(150_000n);
    prisma.settlementDailyStats.findUnique.mockResolvedValue({
      orderCount: 0,
      volumeMinor: 145_000n,
    });

    const result = await service.canSettle({
      ...baseOrder,
      amountMinor: 10_000n,
      buyer: { steamId: '76561198000000001' },
      seller: { steamId: '76561198000000001' },
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('DAILY_VOLUME_LIMIT');
    }
  });
});
