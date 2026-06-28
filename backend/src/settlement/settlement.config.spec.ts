import {
  getEnvAllowlistSteamIds,
  getMaxDailyOrders,
  getMaxDailyVolumeMinor,
  getMaxOrderMinor,
  isRealSettlementEnabled,
  utcDayKey,
} from './settlement.config';

describe('settlement.config', () => {
  const envBackup = process.env;

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it('parses env allowlist ids', () => {
    process.env.STEAM_SETTLEMENT_ALLOWLIST_STEAM_IDS =
      '76561198000000001, 76561198000000002';
    expect([...getEnvAllowlistSteamIds()]).toEqual([
      '76561198000000001',
      '76561198000000002',
    ]);
  });

  it('uses defaults for limits', () => {
    delete process.env.STEAM_SETTLEMENT_MAX_ORDER_MINOR;
    delete process.env.STEAM_SETTLEMENT_MAX_DAILY_ORDERS;
    delete process.env.STEAM_SETTLEMENT_MAX_DAILY_VOLUME_MINOR;
    expect(getMaxOrderMinor()).toBe(50_000n);
    expect(getMaxDailyOrders()).toBe(3);
    expect(getMaxDailyVolumeMinor()).toBe(150_000n);
  });

  it('detects real settlement flag', () => {
    process.env.ENABLE_REAL_SETTLEMENT = 'true';
    expect(isRealSettlementEnabled()).toBe(true);
    process.env.ENABLE_REAL_SETTLEMENT = 'false';
    expect(isRealSettlementEnabled()).toBe(false);
  });

  it('formats utc day key', () => {
    expect(utcDayKey(new Date('2026-06-28T15:30:00.000Z'))).toBe('2026-06-28');
  });
});
