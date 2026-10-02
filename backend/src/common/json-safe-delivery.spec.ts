import { toJsonSafe } from './json-safe.util';
it('does not expose inventory baselines or worker fencing tokens in order API responses', () => {
  expect(
    toJsonSafe({
      amount: 1n,
      tradeOperation: {
        verificationStage: 'MANUAL_REVIEW',
        inventoryBaseline: { buyer: { assets: ['private'] } },
        verificationLeaseToken: 'internal',
      },
    }),
  ).toEqual({
    amount: '1',
    tradeOperation: { verificationStage: 'MANUAL_REVIEW' },
  });
});
