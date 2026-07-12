import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseWalletTab, walletTabHref, WALLET_TABS } from './wallet-tabs.ts';

describe('wallet-tabs', () => {
  it('lists deposit, withdraw, and transactions tabs', () => {
    assert.deepEqual(
      WALLET_TABS.map((tab) => tab.id),
      ['deposit', 'withdraw', 'transactions'],
    );
  });

  it('defaults unknown tab values to deposit', () => {
    assert.equal(parseWalletTab(null), 'deposit');
    assert.equal(parseWalletTab('unknown'), 'deposit');
  });

  it('builds wallet tab hrefs', () => {
    assert.equal(walletTabHref('withdraw'), '/wallet?tab=withdraw');
  });
});
