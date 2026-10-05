import { HybridTradeProvider } from './hybrid-trade.provider';

it('hybrid mode forwards protection checks to live Steam, never mock completion', async () => {
  const completeTrade = jest.fn();
  const verifyTradeReceipt = jest.fn().mockResolvedValue({ status: 'unknown' });
  const provider = new HybridTradeProvider(
    { completeTrade } as never,
    { verifyTradeReceipt } as never,
  );
  const context = {
    sellerSteamId: '76561198000000101',
    buyerSteamId: '76561198000000102',
    assetId: '123',
  };
  expect(await provider.verifyTradeReceipt('456', '789', context)).toEqual({
    status: 'unknown',
  });
  expect(verifyTradeReceipt).toHaveBeenCalledWith('456', '789', context);
  expect(completeTrade).not.toHaveBeenCalled();
});
