/**
 * G3: Post-trade receipt for order page — item, price, fee, offerId.
 */
import type { Order } from '../api/types.ts';

export type PostTradeReceiptRole = 'buyer' | 'seller' | 'other';

export type OrderPostTradeReceiptView = {
  orderId: string;
  orderShortId: string;
  role: PostTradeReceiptRole;
  itemName: string;
  priceMinor: string;
  commissionMinor: string;
  netMinor: string;
  offerId: string | null;
  verbKey: 'postTradeReceipt.bought' | 'postTradeReceipt.sold' | 'postTradeReceipt.deal';
  netCaptionKey:
    | 'postTradeReceipt.paid'
    | 'postTradeReceipt.credited'
    | 'postTradeReceipt.amount';
};

export function canShowOrderPostTradeReceipt(orderStatus: string): boolean {
  return orderStatus === 'COMPLETED';
}

export function buildOrderPostTradeReceipt(params: {
  order: Order;
  role: PostTradeReceiptRole;
}): OrderPostTradeReceiptView | null {
  const { order, role } = params;
  if (!canShowOrderPostTradeReceipt(order.status)) {
    return null;
  }

  const priceMinor = order.amountMinor;
  const commissionMinor = order.lot.commissionMinor ?? '0';
  const sellerReceive = order.lot.sellerReceiveMinor ?? priceMinor;
  const itemName =
    order.lot.listingSnapshot?.marketHashName ??
    order.lot.inventoryAsset.itemDefinition.marketHashName;

  if (role === 'seller') {
    return {
      orderId: order.id,
      orderShortId: order.id.slice(0, 8),
      role,
      itemName,
      priceMinor,
      commissionMinor,
      netMinor: sellerReceive,
      offerId: order.tradeOperation?.externalOfferId ?? null,
      verbKey: 'postTradeReceipt.sold',
      netCaptionKey: 'postTradeReceipt.credited',
    };
  }

  if (role === 'buyer') {
    return {
      orderId: order.id,
      orderShortId: order.id.slice(0, 8),
      role,
      itemName,
      priceMinor,
      commissionMinor,
      netMinor: priceMinor,
      offerId: order.tradeOperation?.externalOfferId ?? null,
      verbKey: 'postTradeReceipt.bought',
      netCaptionKey: 'postTradeReceipt.paid',
    };
  }

  return {
    orderId: order.id,
    orderShortId: order.id.slice(0, 8),
    role: 'other',
    itemName,
    priceMinor,
    commissionMinor,
    netMinor: priceMinor,
    offerId: order.tradeOperation?.externalOfferId ?? null,
    verbKey: 'postTradeReceipt.deal',
    netCaptionKey: 'postTradeReceipt.amount',
  };
}
