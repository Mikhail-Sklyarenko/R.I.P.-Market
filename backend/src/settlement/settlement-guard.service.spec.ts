import { OrderStatus, TradeOperationStatus } from '@prisma/client';
import { SettlementGuardService } from './settlement-guard.service';
import {
  getMaxDailyOrders,
  getMaxDailyVolumeMinor,
  getMaxOrderMinor,
  isRealSettlementEnabled,
  isProofWindowSettlement,
  isSettlementOpenRollout,
  getAutoSettlementMaxOrderMinor,
  getAutoSettlementMaxExposureMinor,
} from './settlement.config';
import { isLiveVerificationMode } from '../trades/trade-verification.config';

jest.mock('./settlement.config', () => {
  const actual = jest.requireActual<typeof import('./settlement.config')>(
    './settlement.config',
  );
  return {
    ...actual,
    isRealSettlementEnabled: jest.fn(() => true),
    isProofWindowSettlement: jest.fn(() => false),
    isSettlementOpenRollout: jest.fn(() => false),
    getAutoSettlementMaxOrderMinor: jest.fn(() => 10000n),
    getAutoSettlementMaxExposureMinor: jest.fn(() => 20000n),
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
    order: { aggregate: jest.Mock };
    settlementAllowlistEntry: { findUnique: jest.Mock };
    settlementDailyStats: { findUnique: jest.Mock };
    ledgerEntry: { findFirst: jest.Mock; aggregate: jest.Mock };
    hold: { findUnique: jest.Mock };
    tradePollEvent: { findFirst: jest.Mock };
    tradeOperation: { findUnique: jest.Mock };
  };
  let service: SettlementGuardService;
  const verifyTradeOffer = jest.fn();
  const verifyTradeReceipt = jest.fn();
  const storedProof = (offerId = '9391832342', assetId = '50586823960') => ({
    version: 3,
    authority: 'STEAM_RECEIPT',
    orderId: 'order-1',
    offerId,
    tradeId: '744938690018816549',
    originalAssetId: assetId,
    sellerSteamId: '76561198000000002',
    buyerSteamId: '76561198000000001',
    receiptStatus: 3,
    offerState: 3,
    bindingVerified: true,
    tradeBinding: 'p2pcs:test-binding',
    verifiedAt: new Date(Date.now() - 9 * 86400000).toISOString(),
    protectionUntil: new Date(Date.now() - 86400000).toISOString(),
  });

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
      order: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amountMinor: 10000n } }),
      },
      settlementAllowlistEntry: { findUnique: jest.fn() },
      settlementDailyStats: { findUnique: jest.fn() },
      ledgerEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amountMinor: -10_000n } }),
      },
      hold: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'hold-1',
          amountMinor: 10_000n,
          capturedMinor: 0n,
          releasedMinor: 0n,
          settlementReleasedAt: null,
          order: {
            holdAmountMinor: 10_000n,
            lot: { sellerReceiveMinor: 9500n, commissionMinor: 500n },
          },
        }),
      },
      tradePollEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      tradeOperation: {
        findUnique: jest.fn().mockResolvedValue({
          externalOfferId: '9391832342',
          expectedAssetId: '50586823960',
          deliveryProof: storedProof(),
          tradeBinding: 'p2pcs:test-binding',
        }),
      },
    };
    verifyTradeOffer.mockReset();
    verifyTradeReceipt.mockReset();
    verifyTradeReceipt.mockResolvedValue({
      status: 'accepted',
      receiptVerified: true,
      tradeId: '744938690018816549',
    });
    verifyTradeOffer.mockResolvedValue({
      status: 'accepted',
      receivedAssetId: '53954582039',
    });
    service = new SettlementGuardService(
      prisma as never,
      { verifyTradeOffer, verifyTradeReceipt } as never,
    );
    (isRealSettlementEnabled as jest.Mock).mockReturnValue(true);
    (isProofWindowSettlement as jest.Mock).mockReturnValue(false);
    (isSettlementOpenRollout as jest.Mock).mockReturnValue(false);
    (getAutoSettlementMaxOrderMinor as jest.Mock).mockReturnValue(10000n);
    (getAutoSettlementMaxExposureMinor as jest.Mock).mockReturnValue(20000n);
    (isLiveVerificationMode as jest.Mock).mockReturnValue(true);
    (getMaxOrderMinor as jest.Mock).mockReturnValue(50_000n);
    (getMaxDailyVolumeMinor as jest.Mock).mockReturnValue(150_000n);
  });

  it.each(['missing-budget', 'order-budget', 'exposure-budget'])(
    'blocks %s',
    async (reason) => {
      (isProofWindowSettlement as jest.Mock).mockReturnValue(true);
      (isSettlementOpenRollout as jest.Mock).mockReturnValue(true);
      if (reason === 'missing-budget')
        (getAutoSettlementMaxExposureMinor as jest.Mock).mockReturnValue(0n);
      if (reason === 'order-budget')
        (getAutoSettlementMaxOrderMinor as jest.Mock).mockReturnValue(9999n);
      if (reason === 'exposure-budget')
        prisma.order.aggregate.mockResolvedValue({
          _sum: { amountMinor: 20001n },
        });
      expect(
        await service.canSettle({
          ...baseOrder,
          status: OrderStatus.SETTLEMENT_HOLD,
        }),
      ).toMatchObject({ allowed: false, code: 'AUTO_SETTLEMENT_RISK_LIMIT' });
    },
  );

  it.each([-1, 0, 1])(
    'proof-window release respects the exact deadline, offset=%s ms',
    async (offset) => {
      (isProofWindowSettlement as jest.Mock).mockReturnValue(true);
      (isSettlementOpenRollout as jest.Mock).mockReturnValue(true);
      const now = Date.now();
      const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
      try {
        prisma.tradeOperation.findUnique.mockResolvedValue({
          externalOfferId: '9391832342',
          expectedAssetId: '50586823960',
          tradeBinding: 'p2pcs:test-binding',
          deliveryProof: {
            ...storedProof(),
            verifiedAt: new Date(now + offset - 8 * 86400000).toISOString(),
            protectionUntil: new Date(now + offset).toISOString(),
          },
        });
        const result = await service.canSettle({
          ...baseOrder,
          status: OrderStatus.SETTLEMENT_HOLD,
        });
        expect(result.allowed).toBe(offset <= 0);
        expect(verifyTradeReceipt).not.toHaveBeenCalled();
        expect(
          prisma.settlementAllowlistEntry.findUnique,
        ).not.toHaveBeenCalled();
      } finally {
        clock.mockRestore();
      }
    },
  );

  it.each([
    'manual-review',
    'recorded-conflict',
    'bad-ledger',
    'already-paid',
    'kill-switch',
    'dispute',
  ])('blocks proof-window payout for %s', async (condition) => {
    (isProofWindowSettlement as jest.Mock).mockReturnValue(true);
    (isSettlementOpenRollout as jest.Mock).mockReturnValue(true);
    if (condition === 'manual-review')
      prisma.tradeOperation.findUnique.mockResolvedValue({
        verificationStage: 'MANUAL_REVIEW',
      });
    if (condition === 'recorded-conflict')
      prisma.tradePollEvent.findFirst.mockResolvedValue({ id: 'conflict' });
    if (condition === 'bad-ledger')
      prisma.ledgerEntry.aggregate.mockResolvedValue({
        _sum: { amountMinor: 9999n },
      });
    if (condition === 'already-paid')
      prisma.ledgerEntry.findFirst.mockResolvedValue({ id: 'paid' });
    if (condition === 'kill-switch')
      (isRealSettlementEnabled as jest.Mock).mockReturnValue(false);
    const result = await service.canSettle({
      ...baseOrder,
      status:
        condition === 'dispute'
          ? OrderStatus.DISPUTE
          : OrderStatus.SETTLEMENT_HOLD,
    });
    expect(result.allowed).toBe(false);
    expect(verifyTradeReceipt).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'pending', 'declined', 'expired', 'needs_confirmation'])(
    'keeps held funds when the fresh Steam status is %s',
    async (status) => {
      prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
        enabled: true,
      });
      verifyTradeReceipt.mockResolvedValue({ status });
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
    verifyTradeReceipt.mockResolvedValue({ status: 'accepted' });
    expect(
      await service.canSettle({
        ...baseOrder,
        status: OrderStatus.SETTLEMENT_HOLD,
      }),
    ).toMatchObject({ allowed: false, code: 'STEAM_RECHECK_UNAVAILABLE' });
  });

  it('rechecks persisted tradeId directly without the old offer', async () => {
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
      enabled: true,
    });
    expect(
      await service.canSettle({
        ...baseOrder,
        status: OrderStatus.SETTLEMENT_HOLD,
      }),
    ).toEqual({ allowed: true });
    expect(verifyTradeOffer).not.toHaveBeenCalled();
    expect(verifyTradeReceipt).toHaveBeenCalledWith(
      '744938690018816549',
      '9391832342',
      {
        sellerSteamId: baseOrder.seller.steamId,
        buyerSteamId: baseOrder.buyer.steamId,
        assetId: '50586823960',
        tradeBinding: 'p2pcs:test-binding',
      },
    );
  });

  it('does not expose credential-bearing network errors', async () => {
    prisma.settlementAllowlistEntry.findUnique.mockResolvedValue({
      enabled: true,
    });
    verifyTradeReceipt.mockRejectedValue(
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
          ...storedProof('9394782030', '50586848789'),
          version: 2,
          destinationAssetId: '123456',
          destinationContextId: '16',
          mappingMethod: 'INVENTORY_DELTA',
          offerId: '9394782030',
          tradeId: '744938690018816549',
          originalAssetId: '50586848789',
          sellerSteamId: baseOrder.seller.steamId,
          buyerSteamId: baseOrder.buyer.steamId,
          protectionUntil: new Date(Date.now() - 1000).toISOString(),
        },
      });
      verifyTradeReceipt.mockResolvedValue({
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
        ...storedProof('9394782030', '50586848789'),
        version: 2,
        destinationAssetId: '123456',
        destinationContextId: '16',
        mappingMethod: 'INVENTORY_DELTA',
        offerId: '9394782030',
        tradeId: '744938690018816549',
        originalAssetId: '50586848789',
        sellerSteamId: baseOrder.seller.steamId,
        buyerSteamId: baseOrder.buyer.steamId,
        protectionUntil: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    verifyTradeReceipt.mockResolvedValue({
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
