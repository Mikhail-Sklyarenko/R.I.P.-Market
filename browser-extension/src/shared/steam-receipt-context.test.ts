import { describe, expect, it } from 'vitest';
import { readReceiptContext } from './steam-receipt-context.js';
const now = 2000000;
const context = { orderId: '0f57e21a-6068-4a8e-a67c-12671ad6ba5a', offerId: '9394782030', savedAt: now };
describe('receipt navigation context', () => {
  it('links only the recent matching offer navigation', () => {
    expect(readReceiptContext(JSON.stringify(context), 'https://steamcommunity.com/tradeoffer/9394782030/', now)).toEqual(context);
  });
  it.each(['https://example.com/tradeoffer/9394782030/', 'https://steamcommunity.com/tradeoffer/1/', '', 'https://steamcommunity.com/'])('rejects unrelated navigation %s', (from) => {
    expect(readReceiptContext(JSON.stringify(context), from, now)).toBeNull();
  });
  it('rejects expired and future contexts', () => {
    for (const time of [now - 1, now + 1800001]) expect(readReceiptContext(JSON.stringify(context), 'https://steamcommunity.com/tradeoffer/9394782030/', time)).toBeNull();
  });
  it('rejects malformed storage', () => {
    expect(readReceiptContext('{', 'https://steamcommunity.com/tradeoffer/9394782030/', now)).toBeNull();
  });
});
