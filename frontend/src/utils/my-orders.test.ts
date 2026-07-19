import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDealNextStepShort } from './my-orders.ts';
import type { Order } from '../api/types.ts';

function stubOrder(status: string): Order {
  return { status } as Order;
}

describe('getDealNextStepShort', () => {
  it('does not repeat terminal status copy in the next-step column', () => {
    assert.equal(getDealNextStepShort(stubOrder('COMPLETED'), 'seller'), '—');
    assert.equal(getDealNextStepShort(stubOrder('CANCELED'), 'buyer'), '—');
    assert.equal(getDealNextStepShort(stubOrder('FAILED'), 'buyer'), '—');
  });

  it('keeps a short action for waiting trade', () => {
    assert.equal(
      getDealNextStepShort(stubOrder('WAITING_TRADE'), 'seller'),
      'Передайте предмет',
    );
    assert.equal(
      getDealNextStepShort(stubOrder('WAITING_TRADE'), 'buyer'),
      'Ожидается передача',
    );
  });
});
