import {
  accountIdToSteamId64,
  hasLinkedSteamId,
  isMockSteamId,
  isRealSteamId,
  steamId64ToAccountId,
} from './steam-id.util';

describe('steam-id.util', () => {
  it('detects mock steam ids', () => {
    expect(isMockSteamId('steam_mock_seller')).toBe(true);
    expect(isMockSteamId('76561198195181115')).toBe(false);
    expect(isMockSteamId(null)).toBe(false);
  });

  it('detects real SteamID64 values', () => {
    expect(isRealSteamId('76561198195181115')).toBe(true);
    expect(isRealSteamId('steam_mock_seller')).toBe(false);
    expect(isRealSteamId(undefined)).toBe(false);
  });

  it('treats only real ids as linked', () => {
    expect(hasLinkedSteamId('76561198195181115')).toBe(true);
    expect(hasLinkedSteamId('steam_mock_seller')).toBe(false);
    expect(hasLinkedSteamId(null)).toBe(false);
  });

  it('converts SteamID64 to trade partner account id', () => {
    expect(steamId64ToAccountId('76561198000000000')).toBe('39734272');
    expect(accountIdToSteamId64('39734272')).toBe('76561198000000000');
    expect(steamId64ToAccountId('steam_mock_seller')).toBeNull();
  });
});
