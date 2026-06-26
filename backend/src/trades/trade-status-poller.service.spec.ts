import { OrderStatus, TradeOperationStatus } from '@prisma/client';

import { TradeStatusPollerService } from './trade-status-poller.service';
import { TradesService } from './trades.service';

describe('TradeStatusPollerService', () => {
  it('transitions to timeout when trade window elapsed', async () => {
    const prisma = {
      tradeOperation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trade-1',
            orderId: 'order-1',
            externalOfferId: null,
            expectedAssetId: 'asset-1',
            createdAt: new Date(),
            order: {
              id: 'order-1',
              buyerId: 'buyer-1',
              sellerId: 'seller-1',
              createdAt: new Date(Date.now() - 2 * 60 * 60_000),
              lot: {
                inventoryAsset: {
                  assetExternalId: 'asset-1',
                  itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
                },
              },
              buyer: { id: 'buyer-1', steamId: 'buyer-steam' },
              seller: { id: 'seller-1', steamId: 'seller-steam' },
            },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      tradePollEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const tradesService = {
      applyTradeTimeout: jest.fn().mockResolvedValue({}),
      verifyOffer: jest.fn(),
      applyTradeConfirmedFromPoll: jest.fn(),
      applyTradeFailedFromPoll: jest.fn(),
    };
    const inventoryDelta = { verify: jest.fn() };

    const poller = new TradeStatusPollerService(
      prisma as never,
      tradesService as unknown as TradesService,
      inventoryDelta as never,
    );

    const result = await poller.pollWaitingTrades();

    expect(result.transitions).toBe(1);
    expect(tradesService.applyTradeTimeout).toHaveBeenCalledWith('order-1', {
      idempotencyKey: 'poll-timeout:order-1',
      auditAction: 'TRADE_POLL_TIMEOUT',
    });
  });

  it('confirms trade when offer status is accepted', async () => {
    const prisma = {
      tradeOperation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'trade-1',
            orderId: 'order-1',
            externalOfferId: '8301234567',
            expectedAssetId: 'asset-1',
            createdAt: new Date(),
            order: {
              id: 'order-1',
              buyerId: 'buyer-1',
              sellerId: 'seller-1',
              createdAt: new Date(),
              lot: {
                inventoryAsset: {
                  assetExternalId: 'asset-1',
                  itemDefinition: { marketHashName: 'AK-47 | Redline (Field-Tested)' },
                },
              },
              buyer: { id: 'buyer-1', steamId: 'buyer-steam' },
              seller: { id: 'seller-1', steamId: 'seller-steam' },
            },
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      tradePollEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const tradesService = {
      applyTradeTimeout: jest.fn(),
      verifyOffer: jest.fn().mockResolvedValue({ status: 'accepted' }),
      applyTradeConfirmedFromPoll: jest.fn().mockResolvedValue({}),
      applyTradeFailedFromPoll: jest.fn(),
    };
    const inventoryDelta = { verify: jest.fn() };

    const poller = new TradeStatusPollerService(
      prisma as never,
      tradesService as unknown as TradesService,
      inventoryDelta as never,
    );

    const result = await poller.pollWaitingTrades();

    expect(result.transitions).toBe(1);
    expect(tradesService.applyTradeConfirmedFromPoll).toHaveBeenCalledWith(
      'order-1',
    );
  });
});
