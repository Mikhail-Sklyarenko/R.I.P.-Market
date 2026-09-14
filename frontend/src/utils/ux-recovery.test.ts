import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeAppReturnPath } from './steam-return-path.ts';
import { getOrderSteps, getOrderNextAction } from './order-flow.ts';
import type { Order } from '../api/types.ts';

test('return path rejects network paths, backslashes and controls', () => {
  for (const path of ['https://example.com', '//example.com', '/\\example.com', '/\t/example.com', '/\n/example.com']) assert.equal(safeAppReturnPath(path), null);
  assert.equal(safeAppReturnPath('/lots/123?wear=FT'), '/lots/123?wear=FT');
});
test('completed order never fabricates an eight day hold', () => {
  assert.equal(getOrderSteps('COMPLETED').some(s => s.key === 'SETTLEMENT_HOLD'), false);
  assert.equal(getOrderSteps('COMPLETED', 'ru', true).find(s => s.key === 'SETTLEMENT_HOLD')?.state, 'done');
  assert.equal(getOrderSteps('SETTLEMENT_HOLD').find(s => s.key === 'SETTLEMENT_HOLD')?.state, 'current');
});
test('buyer receipt replaces the accept instruction for both parties', () => {
  const order = { status: 'WAITING_TRADE', tradeAcknowledgments: { buyerReceived: true }, tradeOperation: { externalOfferId: '123' } } as Order;
  for (const role of ['buyer', 'seller'] as const) assert.equal(getOrderNextAction(order, role)?.kind, 'platform_verifying');
});
