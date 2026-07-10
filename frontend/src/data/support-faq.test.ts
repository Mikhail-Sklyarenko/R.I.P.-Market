import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterSupportFaq, SUPPORT_FAQ_ARTICLES } from '../data/support-faq.ts';

describe('support-faq data', () => {
  it('includes at least six FAQ articles', () => {
    assert.ok(SUPPORT_FAQ_ARTICLES.length >= 6);
  });

  it('filters articles by search query', () => {
    const results = filterSupportFaq('спор');
    assert.ok(results.some((article) => article.id === 'dispute'));
    assert.equal(filterSupportFaq('несуществующий запрос').length, 0);
  });
});
