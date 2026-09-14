import { TronWeb } from 'tronweb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: {} as any, prisma: {} as any }));
vi.mock('../db/client.js', () => ({ prisma: state.prisma }));
vi.mock('../webhook/emitter.js', () => ({ enqueueWebhook: vi.fn() }));
import { processPayout } from './payout-engine.js';
import { enqueueWebhook } from '../webhook/emitter.js';
const config = {
  hotWalletAddress: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
  usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  maxWithdrawalSun: 1000n,
  minConfirmations: 2,
  webhookUrl: 'https://example.test',
  webhookSecret: 'test',
};
const signed = {
  txID: 'a'.repeat(64),
  signature: ['signature'],
  raw_data: { expiration: Date.now() + 3600000 },
};
function tron() {
  return {
    transactionBuilder: {
      triggerSmartContract: vi.fn(async () => ({
        result: { result: true },
        transaction: {},
      })),
    },
    trx: {
      sign: vi.fn(async () => signed),
      getTransactionInfo: vi.fn(async () => ({})),
      getCurrentBlock: vi.fn(async () => ({
        block_header: { raw_data: { number: 100 } },
      })),
      getConfirmedTransaction: vi.fn(async () => ({ txID: signed.txID })),
      sendRawTransaction: vi.fn(async (_transaction: unknown) => ({
        result: true,
      })),
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.row = {
    id: 'w',
    status: 'pending',
    leaseUntil: null,
    signedTransaction: null,
    payoutTxHash: null,
    userId: 'u',
    user: { externalUserId: 'user' },
    amountSun: 100n,
    feeSun: 10n,
    debitSource: 'gateway_balance',
    toAddress: config.hotWalletAddress,
  };
  state.prisma.withdrawal = {
    findUniqueOrThrow: vi.fn(async () => ({ ...state.row })),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const r = state.row;
      if (where.status && !where.status.in.includes(r.status))
        return { count: 0 };
      if (where.OR && r.leaseUntil && r.leaseUntil > new Date())
        return { count: 0 };
      if (where.payoutTxHash === null && r.payoutTxHash !== null)
        return { count: 0 };
      if (
        where.leaseUntil instanceof Date &&
        r.leaseUntil?.getTime() !== where.leaseUntil.getTime()
      )
        return { count: 0 };
      if (
        where.leaseUntil?.gt &&
        (!r.leaseUntil || r.leaseUntil <= where.leaseUntil.gt)
      )
        return { count: 0 };
      Object.assign(r, data);
      return { count: 1 };
    }),
  };
  state.prisma.gatewayUser = { update: vi.fn() };
  state.prisma.$transaction = async (fn: any) => fn(state.prisma);
});
describe('payout safety across uncertain external results', () => {
  it('marks paid exactly once only after confirmed matching USDT transfer', async () => {
    const t = tron();
    state.row.status = 'processing';
    state.row.payoutTxHash = signed.txID;
    const hex = (a: string) => TronWeb.address.toHex(a).slice(2).toLowerCase();
    t.trx.getTransactionInfo.mockResolvedValue({
      id: signed.txID,
      blockNumber: 90,
      receipt: { result: 'SUCCESS' },
      log: [
        {
          address: hex(config.usdtContract),
          topics: [
            'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            hex(config.hotWalletAddress).padStart(64, '0'),
            hex(state.row.toAddress).padStart(64, '0'),
          ],
          data: 100n.toString(16).padStart(64, '0'),
        },
      ],
    } as any);
    await processPayout('w', t as any, config);
    await processPayout('w', t as any, config);
    expect(state.row.status).toBe('paid');
    expect(enqueueWebhook).toHaveBeenCalledOnce();
    expect(state.prisma.gatewayUser.update).not.toHaveBeenCalled();
  });
  it('does not refund when confirmed-node proof is absent', async () => {
    const t = tron();
    state.row.status = 'processing';
    state.row.payoutTxHash = signed.txID;
    t.trx.getTransactionInfo.mockResolvedValue({
      id: signed.txID,
      blockNumber: 90,
      receipt: { result: 'REVERT' },
    } as any);
    t.trx.getConfirmedTransaction.mockResolvedValue({} as any);
    await processPayout('w', t as any, config);
    expect(state.row.status).toBe('processing');
    expect(enqueueWebhook).not.toHaveBeenCalled();
  });
  it('broadcast is not proof of payment', async () => {
    const t = tron();
    await processPayout('w', t as any, config);
    expect(state.row.status).toBe('processing');
    expect(t.trx.sendRawTransaction).toHaveBeenCalledOnce();
    expect(enqueueWebhook).not.toHaveBeenCalled();
  });
  it('two signers claim only one pending withdrawal', async () => {
    const t = tron();
    await Promise.all([
      processPayout('w', t as any, config),
      processPayout('w', t as any, config),
    ]);
    expect(t.transactionBuilder.triggerSmartContract).toHaveBeenCalledOnce();
    expect(t.trx.sendRawTransaction).toHaveBeenCalledOnce();
  });
  it('lost broadcast response preserves debit and reuses exactly the same signed transaction', async () => {
    const t = tron();
    t.trx.sendRawTransaction.mockRejectedValueOnce(new Error('lost response'));
    await processPayout('w', t as any, config);
    await processPayout('w', t as any, config);
    expect(t.transactionBuilder.triggerSmartContract).toHaveBeenCalledOnce();
    expect(t.trx.sendRawTransaction.mock.calls.map((c) => c[0])).toEqual([
      signed,
      signed,
    ]);
    expect(state.prisma.gatewayUser.update).not.toHaveBeenCalled();
    expect(enqueueWebhook).not.toHaveBeenCalled();
  });
  it('confirmed execution failure refunds once and atomically queues failure', async () => {
    const t = tron();
    state.row.status = 'processing';
    state.row.payoutTxHash = signed.txID;
    t.trx.getTransactionInfo.mockResolvedValue({
      id: signed.txID,
      blockNumber: 90,
      receipt: { result: 'REVERT' },
    } as any);
    await processPayout('w', t as any, config);
    await processPayout('w', t as any, config);
    expect(state.row.status).toBe('failed');
    expect(state.prisma.gatewayUser.update).toHaveBeenCalledOnce();
    expect(enqueueWebhook).toHaveBeenCalledOnce();
  });
  it('over-limit rejection refunds the reserved gateway balance once', async () => {
    const t = tron();
    state.row.amountSun = 1001n;
    await processPayout('w', t as any, config);
    await processPayout('w', t as any, config);
    expect(state.row.status).toBe('failed');
    expect(state.prisma.gatewayUser.update).toHaveBeenCalledOnce();
    expect(t.trx.sign).not.toHaveBeenCalled();
  });
  it('backend-authorized funds are refunded only by the backend ledger', async () => {
    const t = tron();
    state.row.debitSource = 'backend_authorized';
    state.row.amountSun = 1001n;
    await processPayout('w', t as any, config);
    expect(state.prisma.gatewayUser.update).not.toHaveBeenCalled();
    expect(enqueueWebhook).toHaveBeenCalledOnce();
  });
  it('does not reconstruct a legacy payout with unknown external outcome', async () => {
    const t = tron();
    state.row.status = 'processing';
    state.row.failReason = 'LEGACY_UNKNOWN_RESULT';
    await processPayout('w', t as any, config);
    expect(t.trx.sign).not.toHaveBeenCalled();
    expect(state.prisma.gatewayUser.update).not.toHaveBeenCalled();
  });
  it('SUCCESS without the expected token transfer does not release funds', async () => {
    const t = tron();
    state.row.status = 'processing';
    state.row.payoutTxHash = signed.txID;
    t.trx.getTransactionInfo.mockResolvedValue({
      id: signed.txID,
      blockNumber: 90,
      receipt: { result: 'SUCCESS' },
      log: [],
    } as any);
    await processPayout('w', t as any, config);
    expect(state.row.status).toBe('processing');
    expect(enqueueWebhook).not.toHaveBeenCalled();
  });
});
