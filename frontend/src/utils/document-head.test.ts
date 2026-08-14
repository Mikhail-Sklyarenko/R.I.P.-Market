import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCanonicalUrl,
  buildPageTitle,
} from './document-head.ts';

describe('document-head', () => {
  it('builds absolute canonical URLs', () => {
    assert.equal(
      buildCanonicalUrl('/catalog/items/ak-47-redline', 'https://p2pcs.ru'),
      'https://p2pcs.ru/catalog/items/ak-47-redline',
    );
  });

  it('formats page titles with the site name', () => {
    assert.equal(
      buildPageTitle('AK-47 | Redline'),
      'AK-47 | Redline — R.I.P. Market',
    );
  });
});
