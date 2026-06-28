import { OrderStatus, TradeOperationStatus } from '@prisma/client';
import { SettlementGuardService } from './settlement-guard.service';
import {
  getMaxDailyOrders,
  getMaxDailyVolumeMinor,
  getMaxOrderMinor,
  isRealSettlementEnabled,
} from './settlement.config';
import { isLiveVerificationMode } from '../trades/trade-verification.config';

jest.mock('./settlement.config', () => ({
  ...jest.requireActual('./settlement.config'),
  isRealSettlementEnabled: jest.fn(() => true),
  getEnvAllowlistSteamIds: jest.fn(() => new Set(['76561198000000001'])),
  getMaxOrderMinor: jest.fn(() => 50_000n),
  getMaxDailyOrders: jest.fn(() => 3),
  getMaxDailyVolumeMinor: jest.fn(() => 150_000n),
  utcDayKey: jest.fn(() => '2026-06-28'),
}));

jest.mock('../trades/trade-verification.config', () => ({
  isLiveVerificationMode: jest.fn(() => true),
}));

describe('SettlementGuardService', () => {
  let prisma: {
    settlementAllowlistEntry: { findUnique: jest.Mock };
    settlementDailyStats: { findUnique: jest.Mock };
    ledgerEntry: { findFirst: jest.Mock };
  };
  let service: SettlementGuardService;

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
      ledgerEntry: { findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    service = new SettlementGuardService(prisma as never);
    (isRealSettlementEnabled as jest.Mock).mockReturnValue(true);
    (isLiveVerificationMode as jest.Mock).mockReturnValue(true);
    (getMaxOrderMinor as jest.Mock).mockReturnValue(50_000n);
    (getMaxDailyVolumeMinor as jest.Mock).mockReturnValue(150_000n);
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
