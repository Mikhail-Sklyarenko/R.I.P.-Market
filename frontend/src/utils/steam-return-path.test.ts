import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeAppReturnPath } from './steam-return-path.ts';

describe('safeAppReturnPath', () => {
  it('accepts same-origin relative paths', () => {
    assert.equal(safeAppReturnPath('/catalog'), '/catalog');
    assert.equal(safeAppReturnPath('/lots/1/checkout?x=1'), '/lots/1/checkout?x=1');
  });

  it('rejects open redirects', () => {
    assert.equal(safeAppReturnPath('https://evil.example'), null);
    assert.equal(safeAppReturnPath('//evil.example'), null);
    assert.equal(safeAppReturnPath(null), null);
  });
});
