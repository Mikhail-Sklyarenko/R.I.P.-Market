import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatTradePollStatus,
  getTradeTimeoutRemainingMinutes,
} from './order-trade.ts';

describe('order-trade utils', () => {
  it('maps trade poll status for waiting operations', () => {
    assert.equal(formatTradePollStatus({ id: '1', status: 'WAITING' }), 'Ожидание');
    assert.equal(
      formatTradePollStatus({
        id: '1',
        status: 'WAITING',
        externalOfferId: '123',
        checkCount: 2,
      }),
      'Проверяем Steam',
    );
    assert.equal(formatTradePollStatus({ id: '1', status: 'CONFIRMED' }), 'Принят');
    assert.equal(formatTradePollStatus({ id: '1', status: 'FAILED_SAFE' }), 'Отклонён');
    assert.equal(
      formatTradePollStatus({
        id: '1',
        status: 'FAILED_DISPUTE',
        failReasonCode: 'INVENTORY_UNKNOWN_EXHAUSTED',
      }),
      'Сбой проверки Steam',
    );
    assert.equal(
      formatTradePollStatus({
        id: '1',
        status: 'FAILED_DISPUTE',
        failReasonCode: 'OFFER_DECLINED',
      }),
      'Отклонён',
    );
  });

  it('calculates remaining timeout minutes', () => {
    const createdAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const remaining = getTradeTimeoutRemainingMinutes(createdAt, 60);
    assert.ok(remaining >= 29 && remaining <= 31);
  });
});
