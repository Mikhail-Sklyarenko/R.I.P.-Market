import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterSupportFaq,
  filterSupportFaqByCategory,
  findFaqArticle,
  getDefaultFaqSelection,
  getSupportFaqCategories,
  SUPPORT_FAQ_ARTICLES,
  SUPPORT_FAQ_CATEGORIES,
} from '../data/support-faq.ts';
import {
  filterSupportWidgetFaq,
  SUPPORT_WIDGET_ARTICLES,
} from '../data/support-widget-faq.ts';

describe('support-faq data', () => {
  it('includes at least six FAQ articles on the page', () => {
    assert.ok(SUPPORT_FAQ_ARTICLES.length >= 6);
  });

  it('includes seven FAQ categories on the page', () => {
    assert.equal(SUPPORT_FAQ_CATEGORIES.length, 7);
  });

  it('filters page articles by search query', () => {
    const results = filterSupportFaq('спор');
    assert.ok(results.some((article) => article.id === 'dispute'));
    assert.equal(filterSupportFaq('несуществующий запрос').length, 0);
  });

  it('filters page categories by search query', () => {
    const results = filterSupportFaqByCategory('вывод');
    assert.ok(results.some((category) => category.id === 'withdrawal'));
  });

  it('serves English FAQ content by locale', () => {
    const en = getSupportFaqCategories('en');
    assert.equal(en.length, 7);
    assert.equal(en[0]?.title, 'General');
    assert.equal(
      findFaqArticle('general', 'what-is-rip', 'en')?.title,
      'What is R.I.P. Market?',
    );
    assert.ok(filterSupportFaq('dispute', 'en').some((a) => a.id === 'dispute'));
  });
});

describe('support-widget-faq data', () => {
  it('has a separate quick-help list for the widget', () => {
    assert.ok(SUPPORT_WIDGET_ARTICLES.length >= 5);
    assert.ok(SUPPORT_WIDGET_ARTICLES.length <= 8);
  });

  it('widget articles are not the same ids as the first page articles', () => {
    const pageIds = new Set(SUPPORT_FAQ_ARTICLES.map((article) => article.id));
    const overlap = SUPPORT_WIDGET_ARTICLES.filter((article) => pageIds.has(article.id));
    assert.equal(overlap.length, 0);
  });

  it('filters widget articles by search query', () => {
    const results = filterSupportWidgetFaq('вывод');
    assert.ok(results.some((article) => article.id === 'widget-withdraw-time'));
  });
});
