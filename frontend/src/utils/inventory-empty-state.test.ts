import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inventoryEmptyKindMessageKeys,
  resolveInventoryEmptyKind,
} from './inventory-empty-state.ts';

describe('inventory-empty-state', () => {
  it('detects private Steam inventory', () => {
    assert.equal(
      resolveInventoryEmptyKind({
        lastSyncedAt: '',
        expiresAt: '',
        stale: true,
        cacheHit: false,
        status: 'FAILED',
        itemCount: 0,
        errorCode: 'STEAM_PROFILE_PRIVATE',
      }),
      'private',
    );
  });

  it('detects sync failures', () => {
    assert.equal(
      resolveInventoryEmptyKind(
        {
          lastSyncedAt: '',
          expiresAt: '',
          stale: true,
          cacheHit: false,
          status: 'FAILED',
          itemCount: 0,
          errorCode: 'INVENTORY_STALE',
        },
        { syncPollTimedOut: false },
      ),
      'syncFailed',
    );

    assert.equal(resolveInventoryEmptyKind(null, { syncPollTimedOut: true }), 'syncFailed');
  });

  it('falls back to tradable empty', () => {
    assert.equal(
      resolveInventoryEmptyKind({
        lastSyncedAt: '',
        expiresAt: '',
        stale: false,
        cacheHit: true,
        status: 'OK',
        itemCount: 0,
      }),
      'tradableEmpty',
    );
  });

  it('maps kinds to i18n keys', () => {
    assert.equal(
      inventoryEmptyKindMessageKeys('private').titleKey,
      'inventory.emptyPrivateTitle',
    );
    assert.equal(
      inventoryEmptyKindMessageKeys('syncFailed').titleKey,
      'inventory.emptySyncTitle',
    );
    assert.equal(
      inventoryEmptyKindMessageKeys('tradableEmpty').titleKey,
      'inventory.emptyTradableTitle',
    );
  });
});
