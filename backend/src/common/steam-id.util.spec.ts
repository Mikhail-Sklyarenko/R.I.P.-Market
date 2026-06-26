import {
  hasLinkedSteamId,
  isMockSteamId,
  isRealSteamId,
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
});
