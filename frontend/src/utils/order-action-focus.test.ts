import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveOrderActionFocus } from './order-action-focus.ts';

describe('resolveOrderActionFocus', () => {
  it('keeps one calm fold for waiting trade: compact timer, no ok health banner', () => {
    const focus = resolveOrderActionFocus({
      orderStatus: 'WAITING_TRADE',
      isMismatch: false,
      dealHealth: {
        tone: 'ok',
        titleKey: 'dealHealth.buyerAcceptTitle',
        bodyKey: 'dealHealth.buyerAcceptBody',
      },
      timeoutUrgency: 'ok',
      extensionConnected: true,
      needsExtensionPair: true,
    });
    assert.equal(focus.showDealHealthInline, false);
    assert.equal(focus.timeoutMode, 'compact');
    assert.equal(focus.collapseSecondary, true);
    assert.equal(focus.extensionPairAboveFold, false);
  });

  it('surfaces warn health and urgent timer without duplicating mismatch', () => {
    const guard = resolveOrderActionFocus({
      orderStatus: 'WAITING_TRADE',
      isMismatch: false,
      dealHealth: {
        tone: 'warn',
        titleKey: 'dealHealth.guardTitle',
        bodyKey: 'dealHealth.guardBody',
        supportCode: 'CONFIRM_PENDING',
      },
      timeoutUrgency: 'critical',
      extensionConnected: true,
      needsExtensionPair: false,
    });
    assert.equal(guard.showDealHealthInline, true);
    assert.equal(guard.timeoutMode, 'expanded');

    const mismatch = resolveOrderActionFocus({
      orderStatus: 'WAITING_TRADE',
      isMismatch: true,
      dealHealth: {
        tone: 'error',
        titleKey: 'dealHealth.mismatchTitle',
        bodyKey: 'dealHealth.mismatchBody',
        supportCode: 'ITEM_MISMATCH',
      },
      timeoutUrgency: 'ok',
      extensionConnected: true,
      needsExtensionPair: false,
    });
    assert.equal(mismatch.showDealHealthInline, false);
  });

  it('keeps extension pair above the fold only when disconnected', () => {
    const offline = resolveOrderActionFocus({
      orderStatus: 'WAITING_TRADE',
      isMismatch: false,
      dealHealth: null,
      timeoutUrgency: 'ok',
      extensionConnected: false,
      needsExtensionPair: true,
    });
    assert.equal(offline.extensionPairAboveFold, true);

    const online = resolveOrderActionFocus({
      ...offline,
      extensionConnected: true,
    });
    assert.equal(online.extensionPairAboveFold, false);
  });

  it('collapses secondary chrome on open dispute', () => {
    const focus = resolveOrderActionFocus({
      orderStatus: 'DISPUTE',
      isMismatch: false,
      dealHealth: null,
      timeoutUrgency: null,
      extensionConnected: false,
      needsExtensionPair: false,
    });
    assert.equal(focus.collapseSecondary, true);
    assert.equal(focus.timeoutMode, 'hidden');
  });
});
