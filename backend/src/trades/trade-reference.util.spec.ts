import { normalizeTradeReferenceInput } from './trade-reference.util';

describe('trade-reference.util', () => {
  it('prefers normalized offerId over tradeUrl', () => {
    expect(
      normalizeTradeReferenceInput({
        offerId: '8301234567',
        tradeUrl: 'https://steamcommunity.com/tradeoffer/8309999999/',
      }),
    ).toBe('8301234567');
  });

  it('falls back to tradeUrl parsing', () => {
    expect(
      normalizeTradeReferenceInput({
        tradeUrl: 'https://steamcommunity.com/tradeoffer/8309876543/',
      }),
    ).toBe('8309876543');
  });
});
