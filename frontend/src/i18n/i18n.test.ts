import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  catalogTabLabel,
  formatLotCountLabel,
  rarityLabel,
  wearLabel,
} from './cs2-labels.ts';
import { translate } from './translate.ts';
import { ruMessages } from './messages/ru.ts';
import { enMessages } from './messages/en.ts';

describe('i18n', () => {
  it('translates nested keys with params', () => {
    assert.equal(
      translate(ruMessages, 'catalog.found', { count: 12 }),
      'Найдено скинов: 12',
    );
    assert.equal(
      translate(enMessages, 'catalog.found', { count: 12 }),
      'Skins found: 12',
    );
  });

  it('uses Steam English rarity and wear labels', () => {
    assert.equal(rarityLabel('Covert', 'ru'), 'Тайное');
    assert.equal(rarityLabel('Covert', 'en'), 'Covert');
    assert.equal(rarityLabel('Extraordinary', 'en'), 'Extraordinary');
    assert.equal(wearLabel('FT', 'ru'), 'После полевых испытаний');
    assert.equal(wearLabel('FT', 'en'), 'Field-Tested');
    assert.equal(wearLabel('FN', 'en'), 'Factory New');
  });

  it('translates catalog tabs', () => {
    assert.equal(catalogTabLabel('knives', 'ru'), 'Ножи');
    assert.equal(catalogTabLabel('knives', 'en'), 'Knives');
    assert.equal(catalogTabLabel('snipers', 'en'), 'Sniper Rifles');
  });

  it('formats lot count plurals', () => {
    assert.equal(formatLotCountLabel(1, 'ru'), '1 лот');
    assert.equal(formatLotCountLabel(2, 'ru'), '2 лота');
    assert.equal(formatLotCountLabel(5, 'ru'), '5 лотов');
    assert.equal(formatLotCountLabel(1, 'en'), '1 listing');
    assert.equal(formatLotCountLabel(5, 'en'), '5 listings');
  });
});
