import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatOrderStatus } from './order-flow.ts';

describe('order-flow utils', () => {
  it('returns human-readable labels instead of raw enum values', () => {
    assert.equal(formatOrderStatus('WAITING_TRADE'), 'Ждём обмен в Steam');
    assert.equal(formatOrderStatus('SETTLEMENT_HOLD'), 'Проверка сделки (до 8 дней)');
    assert.equal(formatOrderStatus('COMPLETED'), 'Сделка завершена');
    assert.equal(formatOrderStatus('DISPUTE'), 'Открыт спор');
  });

  it('does not expose raw status strings in user-facing labels', () => {
    for (const status of ['WAITING_TRADE', 'SETTLEMENT_HOLD', 'TRADE_CONFIRMED']) {
      const label = formatOrderStatus(status);
      assert.notEqual(label, status);
      assert.doesNotMatch(label, /_/);
    }
  });
});
