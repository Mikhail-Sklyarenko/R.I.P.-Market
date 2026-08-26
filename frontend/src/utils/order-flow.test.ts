import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatOrderStatus,
  formatOrderStatusCompact,
  getOrderNextAction,
} from './order-flow.ts';
import type { Order } from '../api/types.ts';

function baseOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    status: 'WAITING_TRADE',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    amountMinor: '1000',
    currency: 'USD',
    createdAt: '2026-08-26T12:00:00.000Z',
    updatedAt: '2026-08-26T12:00:00.000Z',
    lot: {
      id: 'lot-1',
      priceMinor: '1000',
      currency: 'USD',
      status: 'RESERVED',
      inventoryAsset: {
        id: 'asset-1',
        assetExternalId: 'steam-1',
        floatValue: null,
        wear: null,
        paintSeed: null,
        stickers: null,
        itemDefinition: {
          marketHashName: 'AK-47 | Redline (Field-Tested)',
          iconUrl: null,
          name: 'AK-47 | Redline',
          type: 'Rifle',
          rarity: null,
          weapon: 'AK-47',
        },
      },
    },
    tradeOperation: {
      id: 'op-1',
      status: 'WAITING',
      externalOfferId: '1234567890',
      expectedAssetId: 'steam-1',
    },
    hold: null,
    buyer: null,
    seller: null,
    statusEvents: [],
    tradeTask: {
      id: 'task-1',
      type: 'create_offer',
      status: 'IN_PROGRESS',
      executionPhase: 'OFFER_SENT',
      lastErrorCode: null,
      lastErrorMessage: null,
      selectedMarketHashName: null,
      confirmPending: true,
      confirmPendingSince: '2026-08-26T12:00:00.000Z',
      expiresAt: '2026-08-26T13:00:00.000Z',
      attemptCount: 1,
      maxAttempts: 5,
    },
    ...overrides,
  } as Order;
}

describe('order-flow utils', () => {
  it('returns human-readable labels instead of raw enum values', () => {
    assert.equal(formatOrderStatus('WAITING_TRADE'), 'Ждём обмен в Steam');
    assert.equal(formatOrderStatus('SETTLEMENT_HOLD'), 'Проверка сделки (до 8 дней)');
    assert.equal(formatOrderStatus('COMPLETED'), 'Сделка завершена');
    assert.equal(formatOrderStatus('DISPUTE'), 'Открыт спор');
  });

  it('returns compact labels without redundant Сделка prefix', () => {
    assert.equal(formatOrderStatusCompact('COMPLETED'), 'Завершена');
    assert.equal(formatOrderStatusCompact('CANCELED'), 'Отменена');
    assert.equal(formatOrderStatusCompact('FAILED'), 'Не состоялась');
    assert.equal(formatOrderStatusCompact('WAITING_TRADE'), 'Обмен в Steam');
  });

  it('does not expose raw status strings in user-facing labels', () => {
    for (const status of ['WAITING_TRADE', 'SETTLEMENT_HOLD', 'TRADE_CONFIRMED']) {
      const label = formatOrderStatus(status);
      assert.notEqual(label, status);
      assert.doesNotMatch(label, /_/);
    }
  });

  it('shows Guard next action only while confirmPending is true', () => {
    const guard = getOrderNextAction(baseOrder(), 'seller', 'ru');
    assert.equal(guard.title, 'Подтвердите в Steam Guard');

    const afterGuard = getOrderNextAction(
      baseOrder({
        tradeTask: {
          id: 'task-1',
          type: 'create_offer',
          status: 'IN_PROGRESS',
          executionPhase: 'OFFER_SENT',
          lastErrorCode: null,
          lastErrorMessage: null,
          selectedMarketHashName: null,
          confirmPending: false,
          confirmPendingSince: null,
          expiresAt: '2026-08-26T13:00:00.000Z',
          attemptCount: 1,
          maxAttempts: 5,
        },
      }),
      'seller',
      'ru',
    );
    assert.equal(afterGuard.title, 'Ждём покупателя');
  });

  it('surfaces extension mismatch nextAction ahead of Guard/accept', () => {
    const action = getOrderNextAction(
      baseOrder({
        tradeVerification: {
          status: 'mismatch',
          match: false,
          updatedAt: '2026-08-26T12:05:00.000Z',
          offerId: '1234567890',
          failedChecks: [
            {
              key: 'item_asset_match',
              label: 'Asset ID в обмене не совпадает с заказом',
              severity: 'error',
            },
          ],
          nextAction: {
            kind: 'report_issue',
            title: 'Обмен не совпадает с заказом',
            description: 'Не принимайте этот trade offer. Откройте заказ на R.I.P Market.',
          },
        },
      }),
      'buyer',
      'ru',
    );
    assert.equal(action?.kind, 'report_issue');
    assert.equal(action?.title, 'Обмен не совпадает с заказом');
  });

  it('shows manual send when auto-offer failed and no offer id', () => {
    const action = getOrderNextAction(
      baseOrder({
        tradeOperation: {
          id: 'op-1',
          status: 'WAITING',
          externalOfferId: null,
          expectedAssetId: 'steam-1',
        },
        tradeTask: {
          id: 'task-1',
          type: 'create_offer',
          status: 'FAILED',
          executionPhase: 'OFFER_FAILED',
          lastErrorCode: 'TRADE_HOLD_BLOCKED',
          lastErrorMessage: null,
          selectedMarketHashName: null,
          confirmPending: false,
          confirmPendingSince: null,
          expiresAt: '2026-08-26T13:00:00.000Z',
          attemptCount: 2,
          maxAttempts: 5,
        },
      }),
      'seller',
      'ru',
    );
    assert.equal(action.title, 'Отправьте обмен вручную');
  });
});
