import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ruMessages } from '../i18n/messages/ru.ts';
import { enMessages } from '../i18n/messages/en.ts';
import { translate } from '../i18n/translate.ts';
import { formatInventoryFilterTotal } from './inventory-filter-total.ts';

describe('formatInventoryFilterTotal', () => {
  it('explains stacked inventory instead of a truncated grid', () => {
    const ru = formatInventoryFilterTotal({
      itemCount: 15,
      stackCount: 6,
      hiddenCount: 0,
      visibleTotal: 15,
      locale: 'ru',
      t: (key, params) => translate(ruMessages, key, params),
    });
    assert.equal(ru, '15 предметов · 6 стопок');

    const en = formatInventoryFilterTotal({
      itemCount: 15,
      stackCount: 6,
      hiddenCount: 0,
      visibleTotal: 15,
      locale: 'en',
      t: (key, params) => translate(enMessages, key, params),
    });
    assert.equal(en, '15 items · 6 stacks');
  });

  it('surfaces hidden unlistable items', () => {
    const ru = formatInventoryFilterTotal({
      itemCount: 15,
      stackCount: 6,
      hiddenCount: 8,
      visibleTotal: 15,
      locale: 'ru',
      t: (key, params) => translate(ruMessages, key, params),
    });
    assert.equal(ru, '15 предметов · 6 стопок · ещё 8 недоступных');
  });
});
