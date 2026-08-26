import { describe, expect, it } from 'vitest';
import { collectActiveTradeTaskAssets } from './active-trade-task-assets.js';

describe('active-trade-task-assets', () => {
  it('indexes non-terminal tasks by expected Steam asset id', () => {
    const map = collectActiveTradeTaskAssets(
      [
        {
          id: 't1',
          orderId: 'o1',
          executionPhase: 'ITEM_SELECTED',
          payload: { expectedAssetId: '111', orderId: 'o1' },
        },
        {
          id: 't2',
          orderId: 'o2',
          executionPhase: 'OFFER_SENT',
          payload: { expectedAssetId: '222', orderId: 'o2' },
        },
        {
          id: 't3',
          orderId: 'o3',
          executionPhase: null,
          payload: { expectedAssetId: '333', orderId: 'o3' },
        },
      ],
      'https://p2pcs.ru',
    );
    expect(map['111']?.orderId).toBe('o1');
    expect(map['111']?.siteUrl).toContain('/orders/o1');
    expect(map['222']).toBeUndefined();
    expect(map['333']?.taskId).toBe('t3');
  });
});
