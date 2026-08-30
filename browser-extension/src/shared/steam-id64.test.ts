import { describe, expect, it } from 'vitest';
import {
  accountIdToSteamId64,
  extractSteamId64FromHref,
  isRealSteamId64,
} from './steam-id64.js';

describe('steam-id64', () => {
  it('validates and converts account ids', () => {
    expect(isRealSteamId64('76561198000000000')).toBe(true);
    expect(accountIdToSteamId64('39734272')).toBe('76561198000000000');
    expect(
      extractSteamId64FromHref(
        'https://steamcommunity.com/profiles/76561198000000000/',
      ),
    ).toBe('76561198000000000');
  });
});
