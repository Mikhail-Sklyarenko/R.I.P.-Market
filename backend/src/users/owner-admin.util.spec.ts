import { isRealSteamId } from '../common/steam-id.util';
import {
  isOwnerAdminSteamId,
  parseOwnerAdminSteamIds,
} from './owner-admin.util';

describe('owner-admin util', () => {
  const original = process.env.OWNER_ADMIN_STEAM_IDS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.OWNER_ADMIN_STEAM_IDS;
    } else {
      process.env.OWNER_ADMIN_STEAM_IDS = original;
    }
  });

  it('parses valid SteamID64 values from env', () => {
    process.env.OWNER_ADMIN_STEAM_IDS =
      '76561198195181115, not-a-steam, 76561198746622771';
    const ids = parseOwnerAdminSteamIds();
    expect(ids.has('76561198195181115')).toBe(true);
    expect(ids.has('76561198746622771')).toBe(true);
    expect(ids.size).toBe(2);
  });

  it('returns empty set when unset', () => {
    delete process.env.OWNER_ADMIN_STEAM_IDS;
    expect(parseOwnerAdminSteamIds().size).toBe(0);
  });

  it('detects owner steam ids', () => {
    const allowlist = new Set(['76561198195181115']);
    expect(isOwnerAdminSteamId('76561198195181115', allowlist)).toBe(true);
    expect(isOwnerAdminSteamId('76561198746622771', allowlist)).toBe(false);
    expect(isRealSteamId('76561198195181115')).toBe(true);
  });
});
