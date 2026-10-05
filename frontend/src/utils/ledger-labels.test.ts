import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLedgerEntryType } from './ledger-labels.ts';

test('settlement capture is labelled as spending the hold, not a second reservation', () => {
  assert.equal(formatLedgerEntryType('HOLD_RESERVE', 'ru'), 'Резерв (hold)');
  assert.equal(formatLedgerEntryType('HOLD_RESERVE', 'ru', { action: 'settlement_capture' }), 'Оплата из резерва');
  assert.equal(formatLedgerEntryType('HOLD_RESERVE', 'en', { action: 'settlement_capture' }), 'Payment from hold');
  assert.equal(formatLedgerEntryType('HOLD_RESERVE', 'en', { direction: 'available_to_hold' }), 'Hold reserved');
  assert.equal(formatLedgerEntryType('SETTLEMENT_SELLER', 'en', { action: 'settlement_capture' }), 'Seller payout');
});
