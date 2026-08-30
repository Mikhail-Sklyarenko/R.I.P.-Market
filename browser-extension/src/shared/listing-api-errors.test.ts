import { describe, expect, it } from 'vitest';
import {
  humanizeListingApiError,
  isHardSteamTradeBanCode,
  isRetryableBanCheckCode,
} from './listing-api-errors.js';

describe('listing-api-errors', () => {
  it('maps ban-check unavailable honestly (not as VAC)', () => {
    expect(
      humanizeListingApiError({
        code: 'STEAM_BAN_CHECK_UNAVAILABLE',
        message: 'Unable to verify VAC status — try again shortly',
      }),
    ).toMatch(/не бан/i);
    expect(
      humanizeListingApiError({
        message:
          'Extension API /lots failed: 503 Unable to verify VAC status — try again shortly',
      }),
    ).toMatch(/не бан/i);
  });

  it('keeps real VAC / game ban copy distinct', () => {
    expect(
      humanizeListingApiError({ code: 'STEAM_VAC_BANNED' }),
    ).toMatch(/VAC-бан/i);
    expect(
      humanizeListingApiError({ code: 'STEAM_GAME_BANNED' }),
    ).toMatch(/игровым баном/i);
    expect(isHardSteamTradeBanCode('STEAM_VAC_BANNED')).toBe(true);
    expect(isRetryableBanCheckCode('STEAM_BAN_CHECK_UNAVAILABLE')).toBe(true);
    expect(isHardSteamTradeBanCode('STEAM_BAN_CHECK_UNAVAILABLE')).toBe(false);
  });
});
