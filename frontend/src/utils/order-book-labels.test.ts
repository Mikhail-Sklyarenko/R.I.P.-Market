import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBuyerSellHintPrefix } from './order-book-labels.ts';

describe('formatBuyerSellHintPrefix', () => {
  it('uses singular forms in Russian and English', () => {
    assert.match(formatBuyerSellHintPrefix(1, 'ru'), /1 покупатель готов/);
    assert.match(formatBuyerSellHintPrefix(1, 'en'), /1 buyer ready/);
  });

  it('uses few/many forms in Russian', () => {
    assert.match(formatBuyerSellHintPrefix(2, 'ru'), /2 покупателя готовы/);
    assert.match(formatBuyerSellHintPrefix(5, 'ru'), /5 покупателей готовы/);
  });
});
