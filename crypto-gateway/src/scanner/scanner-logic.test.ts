import { describe, expect, it } from 'vitest';
import { createMockTronGridClient } from './trongrid.js';

describe('scanner trongrid mock', () => {
  it('filters transfers by block range and address', async () => {
    const transfers = [
      {
        txHash: 'abc123',
        toAddress: 'TTestAddress1234567890123456789012',
        fromAddress: 'TSender',
        amountSun: 2_000_000n,
        blockNumber: 100n,
        confirmations: 20,
      },
      {
        txHash: 'def456',
        toAddress: 'TOther',
        fromAddress: 'TSender',
        amountSun: 1_000_000n,
        blockNumber: 101n,
        confirmations: 19,
      },
    ];

    const tronGrid = createMockTronGridClient(transfers, 120n);
    const result = await tronGrid.getTrc20Transfers({
      contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      minBlock: 100n,
      maxBlock: 120n,
      toAddress: 'TTestAddress1234567890123456789012',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.txHash).toBe('abc123');
  });
});
