import { SteamOrderVerificationService } from './steam-order-verification.service';
import { SteamTradeProvider } from '../providers/trade/steam-trade.provider';
import { requestCredential } from '../providers/trade/steam-request-credential';
const id = '0f57e21a-6068-4a8e-a67c-12671ad6ba5a';
const context = {
  sellerSteamId: '76561198195181115',
  buyerSteamId: '76561198655632881',
  assetId: '50586848789',
};
let order: any,
  prisma: any,
  poller: any,
  service: SteamOrderVerificationService;
const body = () => ({
  orderId: id,
  offerId: '9394782030',
  consent: true,
  accessToken: 'synthetic-test-credential-not-real-12345',
});
beforeEach(() => {
  order = {
    id,
    sellerId: 'seller',
    status: 'WAITING_TRADE',
    seller: { steamId: context.sellerSteamId, status: 'ACTIVE' },
    buyer: { steamId: context.buyerSteamId },
    tradeOperation: {
      externalOfferId: '9394782030',
      expectedAssetId: context.assetId,
    },
    lot: { inventoryAsset: { assetExternalId: context.assetId } },
  };
  prisma = {
    order: { findUnique: jest.fn(async () => order) },
    tradeOperation: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  poller = { pollOrderById: jest.fn(async () => true) };
  service = new SteamOrderVerificationService(prisma, poller);
});
afterEach(() => jest.restoreAllMocks());
it('explains a missing buyer identity without granting preparation', async () => {
  order.buyer.steamId = null;
  expect(await service.preparationFailure('seller', id)).toBe(
    'BUYER_STEAM_ID_MISSING',
  );
});
it.each([
  'BASELINE_ORIGINAL_MISSING',
  'BASELINE_UNAVAILABLE',
  'MAPPING_WINDOW_BUSY',
  'BASELINE_EXPIRED',
])('returns safe preparation reason %s', async (reason) => {
  order.tradeOperation.failReasonCode = reason;
  expect(await service.preparationFailure('seller', id)).toBe(reason);
});
it('does not expose arbitrary upstream errors as preparation reasons', async () => {
  order.tradeOperation.failReasonCode = 'upstream-secret-detail';
  expect(await service.preparationFailure('seller', id)).toBe(
    'BEFORE_BASELINE_NOT_READY',
  );
});
it('rejects buyer, changed offer and missing consent before Steam read', async () => {
  const spy = jest.spyOn(SteamTradeProvider.prototype, 'verifyTradeOffer');
  await expect(service.run('buyer', body())).rejects.toThrow();
  await expect(
    service.run('seller', { ...body(), offerId: '1' }),
  ).rejects.toThrow();
  await expect(
    service.run('seller', { ...body(), consent: false }),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('deletes payload token and binds independent verification to request', async () => {
  jest
    .spyOn(SteamTradeProvider.prototype, 'verifyTradeOffer')
    .mockImplementation(async () => {
      expect(requestCredential('9394782030', context)).toBe(body().accessToken);
      return {
        status: 'accepted',
        receivedAssetId: '123',
        tradable: null,
        tradeLockUntil: null,
      };
    });
  const payload = body();
  expect(await service.run('seller', payload)).toMatchObject({
    transitioned: true,
  });
  expect(payload).not.toHaveProperty('accessToken');
  expect(poller.pollOrderById).toHaveBeenCalledWith(id, { force: true });
  expect(requestCredential('9394782030', context)).toBeUndefined();
  await expect(service.run('seller', body())).rejects.toThrow('cooldown');
});
it.each(['DISPUTE', 'WAITING_TRADE'])(
  'does not force poll unknown evidence in %s',
  async (status) => {
    order.status = status;
    jest
      .spyOn(SteamTradeProvider.prototype, 'verifyTradeOffer')
      .mockResolvedValue({
        status: 'unknown',
        tradable: null,
        tradeLockUntil: null,
      });
    await service.run('seller', body());
    expect(poller.pollOrderById).not.toHaveBeenCalled();
  },
);
it('never reopens disputed orders even with proof', async () => {
  order.status = 'DISPUTE';
  jest
    .spyOn(SteamTradeProvider.prototype, 'verifyTradeOffer')
    .mockResolvedValue({
      status: 'accepted',
      receivedAssetId: '123',
      tradable: null,
      tradeLockUntil: null,
    });
  expect(await service.run('seller', body())).toMatchObject({
    diagnosticOnly: true,
    transitioned: false,
  });
  expect(poller.pollOrderById).not.toHaveBeenCalled();
});
it('suppresses unexpected errors containing credentials', async () => {
  jest
    .spyOn(SteamTradeProvider.prototype, 'verifyTradeOffer')
    .mockRejectedValue(new Error(body().accessToken));
  await expect(service.run('seller', body())).rejects.toThrow(
    'Steam verification unavailable',
  );
});

it.each(['WAITING_TRADE', 'SETTLEMENT_HOLD'])(
  'fresh credential conflict freezes %s without release',
  async (status) => {
    order.status = status;
    jest
      .spyOn(SteamTradeProvider.prototype, 'verifyTradeOffer')
      .mockResolvedValue({
        status: 'unknown',
        identityConflict: true,
        reasonCode: 'STEAM_IDENTITY_CONFLICT',
        tradable: null,
        tradeLockUntil: null,
      });
    expect(await service.run('seller', body())).toMatchObject({
      transitioned: false,
    });
    expect(prisma.tradeOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verificationStage: 'MANUAL_REVIEW' }),
      }),
    );
    expect(poller.pollOrderById).not.toHaveBeenCalled();
  },
);
