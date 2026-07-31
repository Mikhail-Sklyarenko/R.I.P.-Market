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

  it('exposes Valve trademark disclaimer in both locales', () => {
    assert.match(
      translate(ruMessages, 'footer.trademarkDisclaimer'),
      /Valve Corporation/,
    );
    assert.match(
      translate(enMessages, 'footer.trademarkDisclaimer'),
      /not affiliated with Valve/i,
    );
  });

  // A client-extra override that forgets a placeholder silently drops the value
  // it was meant to interpolate — inventory.lastSync lost its timestamp that way.
  it('keeps the same placeholders in every locale', () => {
    const flatten = (
      value: Record<string, unknown>,
      prefix = '',
      out = new Map<string, string>(),
    ) => {
      for (const [key, entry] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          flatten(entry as Record<string, unknown>, path, out);
        } else if (typeof entry === 'string') {
          out.set(path, entry);
        }
      }
      return out;
    };
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort().join(',');

    const ru = flatten(ruMessages as unknown as Record<string, unknown>);
    const en = flatten(enMessages as unknown as Record<string, unknown>);
    const mismatched: string[] = [];
    for (const [key, ruText] of ru) {
      const enText = en.get(key);
      if (enText === undefined) {
        continue;
      }
      if (placeholders(ruText) !== placeholders(enText)) {
        mismatched.push(key);
      }
    }

    assert.deepEqual(mismatched, []);
  });
});
