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
  };

  const service = new ExtensionTradeAckService(prisma as never);

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
  });

  it('rejects OFFER_SENT when seller inventory no longer holds asset', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      status: OrderStatus.WAITING_TRADE,
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
    ).rejects.toMatchObject({
      details: { reasonCode: 'ITEM_MISSING' },
    });
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
  });
});
