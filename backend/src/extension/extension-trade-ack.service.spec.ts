import { OrderStatus } from '@prisma/client';
import { ExtensionTradeAckService } from './extension-trade-ack.service';

describe('ExtensionTradeAckService', () => {
  const prisma = {
    order: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    tradeAcknowledgment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    tradeVerificationSnapshot: {
      create: jest.fn().mockResolvedValue({ id: 'snap-1' }),
    },
  };

  const tradeStatusPoller = {
    pollOrderById: jest.fn().mockResolvedValue(false),
  };

  const service = new ExtensionTradeAckService(
    prisma as never,
    tradeStatusPoller as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_EXTENSION_TRADE_ACKNOWLEDGMENT = 'true';
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  });

  afterEach(() => {
    delete process.env.ENABLE_EXTENSION_TRADE_ACKNOWLEDGMENT;
  });

  it('builds verified result for buyer with linked offer', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: OrderStatus.WAITING_TRADE,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      amountMinor: 1000n,
      holdAmountMinor: 1000n,
      lot: {
        listingSnapshot: null,
        inventoryAsset: {
          assetExternalId: 'asset-1',
          floatValue: null,
          wear: 'FT',
          itemDefinition: {
            marketHashName: 'AK-47 | Redline (Field-Tested)',
            iconUrl: null,
          },
        },
      },
      tradeOperation: {
        externalOfferId: '1234567890',
        expectedAssetId: 'asset-1',
      },
      hold: { amountMinor: 1000n },
      buyer: {
        id: 'buyer-1',
        username: 'buyer',
        steamId: '76561198000000001',
        steamPersonaName: 'Buyer',
        steamAvatarUrl: null,
      },
      seller: {
        id: 'seller-1',
        username: 'seller',
        steamId: '76561198000000002',
        steamPersonaName: 'Seller',
        steamAvatarUrl: null,
      },
    });
    prisma.tradeAcknowledgment.findMany.mockResolvedValue([]);

    const result = await service.verifyTrade(
      'buyer-1',
      'order-1',
      '1234567890',
    );

    expect(result.role).toBe('buyer');
    expect(result.verificationStatus).toBe('verified');
    expect(result.offerId).toBe('1234567890');
    expect(
      result.checks.some(
        (check) => check.key === 'offer_id_match' && check.passed,
      ),
    ).toBe(true);
  });

  it('marks mismatch when observed asset id differs from snapshot', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: OrderStatus.WAITING_TRADE,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      amountMinor: 1000n,
      holdAmountMinor: 1000n,
      lot: {
        listingSnapshot: {
          assetExternalId: 'asset-1',
          marketHashName: 'AK-47 | Redline (Field-Tested)',
          floatValue: '0.254319',
          wear: 'FT',
          iconUrl: null,
          stickers: [],
        },
        inventoryAsset: {
          assetExternalId: 'asset-1',
          floatValue: '0.254319',
          wear: 'FT',
          stickers: [],
          itemDefinition: {
            marketHashName: 'AK-47 | Redline (Field-Tested)',
            iconUrl: null,
          },
        },
      },
      tradeOperation: {
        externalOfferId: '1234567890',
        expectedAssetId: 'asset-1',
      },
      hold: { amountMinor: 1000n },
      buyer: {
        id: 'buyer-1',
        username: 'buyer',
        steamId: '76561198000000001',
        steamPersonaName: 'Buyer',
        steamAvatarUrl: null,
      },
      seller: {
        id: 'seller-1',
        username: 'seller',
        steamId: '76561198000000002',
        steamPersonaName: 'Seller',
        steamAvatarUrl: null,
      },
    });
    prisma.tradeAcknowledgment.findMany.mockResolvedValue([]);

    const result = await service.verifyTrade(
      'buyer-1',
      'order-1',
      '1234567890',
      {
        assetId: 'wrong-asset',
        floatValue: '0.254319',
      },
    );

    expect(result.verificationStatus).toBe('mismatch');
    expect(
      result.checks.some(
        (check) => check.key === 'item_asset_match' && !check.passed,
      ),
    ).toBe(true);
    expect(prisma.tradeVerificationSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          source: 'EXTENSION',
          observedStatus: 'mismatch',
          match: false,
        }),
      }),
    );
  });

  it('allows OFFER_SENT and triggers delivery check when seller inventory no longer holds asset', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: OrderStatus.WAITING_TRADE,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      amountMinor: 1000n,
      holdAmountMinor: 1000n,
      lot: {
        listingSnapshot: {
          assetExternalId: 'asset-1',
          marketHashName: 'AK-47 | Redline (Field-Tested)',
          floatValue: '0.254319',
          wear: 'FT',
          iconUrl: null,
          stickers: [],
        },
        inventoryAsset: {
          ownerId: 'seller-1',
          status: 'SOLD',
          assetExternalId: 'asset-1',
          floatValue: '0.254319',
          wear: 'FT',
          stickers: [],
          itemDefinition: {
            marketHashName: 'AK-47 | Redline (Field-Tested)',
            iconUrl: null,
          },
        },
      },
      tradeOperation: {
        externalOfferId: null,
        expectedAssetId: 'asset-1',
      },
      hold: { amountMinor: 1000n },
      buyer: {
        id: 'buyer-1',
        username: 'buyer',
        steamId: '76561198000000001',
        steamPersonaName: 'Buyer',
        steamAvatarUrl: null,
      },
      seller: {
        id: 'seller-1',
        username: 'seller',
        steamId: '76561198000000002',
        steamPersonaName: 'Seller',
        steamAvatarUrl: null,
      },
    });

    await expect(
      service.assertOfferSentTrustGate({
        sellerId: 'seller-1',
        orderId: 'order-1',
        offerId: '1234567890',
        observed: { assetId: 'asset-1', floatValue: '0.254319' },
      }),
    ).resolves.toBeUndefined();
    expect(tradeStatusPoller.pollOrderById).toHaveBeenCalledWith('order-1');
  });

  it('asks seller to confirm Guard only while Steam still needs confirmation', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: OrderStatus.WAITING_TRADE,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      amountMinor: 1000n,
      holdAmountMinor: 1000n,
      lot: {
        listingSnapshot: null,
        inventoryAsset: {
          assetExternalId: 'asset-1',
          floatValue: null,
          wear: 'FT',
          itemDefinition: {
            marketHashName: 'AK-47 | Redline (Field-Tested)',
            iconUrl: null,
          },
        },
      },
      tradeOperation: {
        externalOfferId: '1234567890',
        expectedAssetId: 'asset-1',
        pollEvents: [{ offerStatus: 'needs_confirmation' }],
      },
      tasks: [
        {
          executionPhase: 'OFFER_SENT',
          lastErrorCode: null,
          statusEvents: [
            {
              phase: 'CONFIRM_PENDING',
              payload: {},
              reasonCode: null,
              createdAt: new Date(),
            },
          ],
        },
      ],
      hold: { amountMinor: 1000n },
      buyer: {
        id: 'buyer-1',
        username: 'buyer',
        steamId: '76561198000000001',
        steamPersonaName: 'Buyer',
        steamAvatarUrl: null,
      },
      seller: {
        id: 'seller-1',
        username: 'seller',
        steamId: '76561198000000002',
        steamPersonaName: 'Seller',
        steamAvatarUrl: null,
      },
    });
    prisma.tradeAcknowledgment.findMany.mockResolvedValue([]);

    const pending = await service.verifyTrade(
      'seller-1',
      'order-1',
      '1234567890',
    );
    expect(pending.nextAction.kind).toBe('confirm_guard');

    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: OrderStatus.WAITING_TRADE,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      amountMinor: 1000n,
      holdAmountMinor: 1000n,
      lot: {
        listingSnapshot: null,
        inventoryAsset: {
          assetExternalId: 'asset-1',
          floatValue: null,
          wear: 'FT',
          itemDefinition: {
            marketHashName: 'AK-47 | Redline (Field-Tested)',
            iconUrl: null,
          },
        },
      },
      tradeOperation: {
        externalOfferId: '1234567890',
        expectedAssetId: 'asset-1',
        pollEvents: [{ offerStatus: 'pending' }],
      },
      tasks: [
        {
          executionPhase: 'OFFER_SENT',
          lastErrorCode: null,
          statusEvents: [
            {
              phase: 'CONFIRM_PENDING',
              payload: {},
              reasonCode: null,
              createdAt: new Date(),
            },
          ],
        },
      ],
      hold: { amountMinor: 1000n },
      buyer: {
        id: 'buyer-1',
        username: 'buyer',
        steamId: '76561198000000001',
        steamPersonaName: 'Buyer',
        steamAvatarUrl: null,
      },
      seller: {
        id: 'seller-1',
        username: 'seller',
        steamId: '76561198000000002',
        steamPersonaName: 'Seller',
        steamAvatarUrl: null,
      },
    });

    const cleared = await service.verifyTrade(
      'seller-1',
      'order-1',
      '1234567890',
    );
    expect(cleared.nextAction.kind).toBe('wait');
    expect(cleared.nextAction.title).toContain('покупателя');
  });

  it('asks seller to send manually when auto-offer failed', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: OrderStatus.WAITING_TRADE,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      amountMinor: 1000n,
      holdAmountMinor: 1000n,
      lot: {
        listingSnapshot: null,
        inventoryAsset: {
          assetExternalId: 'asset-1',
          floatValue: null,
          wear: 'FT',
          itemDefinition: {
            marketHashName: 'AK-47 | Redline (Field-Tested)',
            iconUrl: null,
          },
        },
      },
      tradeOperation: {
        externalOfferId: null,
        expectedAssetId: 'asset-1',
        pollEvents: [],
      },
      tasks: [
        {
          status: 'FAILED',
          executionPhase: 'OFFER_FAILED',
          lastErrorCode: 'TRADE_HOLD_BLOCKED',
          attemptCount: 2,
          maxAttempts: 5,
          statusEvents: [],
        },
      ],
      hold: { amountMinor: 1000n },
      buyer: {
        id: 'buyer-1',
        username: 'buyer',
        steamId: '76561198000000001',
        steamPersonaName: 'Buyer',
        steamAvatarUrl: null,
        tradeUrl: 'https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc',
      },
      seller: {
        id: 'seller-1',
        username: 'seller',
        steamId: '76561198000000002',
        steamPersonaName: 'Seller',
        steamAvatarUrl: null,
        tradeUrl: null,
      },
    });
    prisma.tradeAcknowledgment.findMany.mockResolvedValue([]);

    const result = await service.verifyTrade('seller-1', 'order-1');
    expect(result.nextAction.kind).toBe('send_manual');
    expect(result.buyerTradeUrl).toContain('steamcommunity.com/tradeoffer/new');
  });

  it('acknowledges buyer pre-accept idempotently', async () => {
    prisma.tradeAcknowledgment.findUnique.mockResolvedValue({
      id: 'ack-1',
      type: 'BUYER_ACK_PRE_ACCEPT',
    });

    const result = await service.acknowledge({
      userId: 'buyer-1',
      orderId: 'order-1',
      type: 'BUYER_ACK_PRE_ACCEPT',
      idempotencyKey: 'ack:order-1:BUYER_ACK_PRE_ACCEPT',
    });

    expect(result.idempotent).toBe(true);
    expect(prisma.tradeAcknowledgment.create).not.toHaveBeenCalled();
    expect(tradeStatusPoller.pollOrderById).not.toHaveBeenCalled();
  });

  it('triggers immediate trade poll after buyer received ack', async () => {
    prisma.tradeAcknowledgment.findUnique.mockResolvedValue(null);
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: OrderStatus.WAITING_TRADE,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      lot: {
        listingSnapshot: null,
        inventoryAsset: {
          assetExternalId: 'asset-1',
          floatValue: null,
          wear: null,
          itemDefinition: { marketHashName: 'Revolution Case' },
        },
      },
      tradeOperation: { externalOfferId: '1234567890' },
      buyer: { id: 'buyer-1', steamId: 'buyer-steam' },
      seller: { id: 'seller-1', steamId: 'seller-steam' },
    });
    prisma.tradeAcknowledgment.create.mockResolvedValue({ id: 'ack-2' });

    const result = await service.acknowledge({
      userId: 'buyer-1',
      orderId: 'order-1',
      type: 'BUYER_ACK_RECEIVED',
      idempotencyKey: 'ack:order-1:BUYER_ACK_RECEIVED',
    });

    expect(result.idempotent).toBe(false);
    expect(tradeStatusPoller.pollOrderById).toHaveBeenCalledWith('order-1', {
      force: true,
    });
  });

  it('exposes settlementHoldUntil and deliveryProgress for post-accept orders', async () => {
    const holdUntil = new Date('2026-09-04T12:00:00.000Z');
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-hold',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: OrderStatus.SETTLEMENT_HOLD,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      amountMinor: 2500n,
      holdAmountMinor: 2500n,
      lot: {
        listingSnapshot: null,
        inventoryAsset: {
          assetExternalId: 'asset-1',
          floatValue: null,
          wear: 'FT',
          itemDefinition: {
            marketHashName: 'AK-47 | Redline (Field-Tested)',
            iconUrl: null,
          },
        },
      },
      tradeOperation: {
        externalOfferId: '1234567890',
        expectedAssetId: 'asset-1',
        pollEvents: [
          {
            offerStatus: 'Accepted',
            outcome: 'confirmed',
            strategy: 'inventory:confirmed',
            error: null,
            checkedAt: new Date('2026-08-27T01:00:00.000Z'),
          },
        ],
      },
      hold: { amountMinor: 2500n, settlementHoldUntil: holdUntil },
      buyer: {
        id: 'buyer-1',
        username: 'buyer',
        steamId: '76561198000000001',
        steamPersonaName: 'Buyer',
        steamAvatarUrl: null,
      },
      seller: {
        id: 'seller-1',
        username: 'seller',
        steamId: '76561198000000002',
        steamPersonaName: 'Seller',
        steamAvatarUrl: null,
      },
    });
    prisma.tradeAcknowledgment.findMany.mockResolvedValue([]);

    const result = await service.verifyTrade('seller-1', 'order-hold');

    expect(result.role).toBe('seller');
    expect(result.settlementHoldUntil).toBe(holdUntil.toISOString());
    expect(result.deliveryProgress).toMatchObject({
      offerTone: 'ok',
      inventoryTone: 'ok',
      inventoryHint: 'confirmed',
    });
    expect(result.commissionMinor).toBe('125');
    expect(result.sellerReceiveMinor).toBe('2375');
  });
});
