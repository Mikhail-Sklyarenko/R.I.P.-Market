import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatUsdFromMinor, formatUsdtFromMinor } from './format.ts';
import { getTrc20AddressError, isValidTrc20Address } from './trc20-address.ts';

describe('formatUsdFromMinor', () => {
  it('formats ledger minor units as USD', () => {
    assert.equal(formatUsdFromMinor(100), '$1.00');
    assert.equal(formatUsdFromMinor(12_345), '$123.45');
  });
});

describe('formatUsdtFromMinor', () => {
  it('formats on-chain USDT face amounts (not marketplace balance)', () => {
    assert.equal(formatUsdtFromMinor(100), '1.00 USDT');
    assert.equal(formatUsdtFromMinor(12_345), '123.45 USDT');
  });
});

describe('trc20 address validation', () => {
  it('accepts valid TRON base58 addresses', () => {
    assert.equal(isValidTrc20Address('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'), true);
  });

  it('rejects invalid addresses', () => {
    assert.equal(isValidTrc20Address(''), false);
    assert.equal(isValidTrc20Address('1BadAddress'), false);
    assert.equal(getTrc20AddressError('1BadAddress'), 'TRC-20 адрес должен начинаться с T.');
  });
});
