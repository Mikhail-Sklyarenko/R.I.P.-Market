import { Logger } from '@nestjs/common';
import { TradesService } from './trades.service';
import { SteamTradeRateLimitError } from '../providers/trade/steam-trade.provider';

describe('trade verification failure confidentiality', () => {
  const provider = { verifyTradeOffer: jest.fn() };
  const service = new TradesService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    provider as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  afterEach(() => jest.restoreAllMocks());

  it('fails closed without logging authenticated URLs or arbitrary error data', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    provider.verifyTradeOffer.mockRejectedValue(
      new Error('https://api.steampowered.com/?key=SECRET&access_token=TOKEN'),
    );
    await expect(
      service.verifyOffer('untrusted-secret-input'),
    ).resolves.toEqual({
      status: 'unknown',
      tradable: null,
      tradeLockUntil: null,
    });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      'Steam trade verification request failed',
    );
  });

  it('preserves rate-limit backoff without logging the error', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const error = new SteamTradeRateLimitError();
    provider.verifyTradeOffer.mockRejectedValue(error);
    await expect(service.verifyOffer('9391832342')).rejects.toBe(error);
    expect(warning).not.toHaveBeenCalled();
  });
});
