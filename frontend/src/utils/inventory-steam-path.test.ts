import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INVENTORY_LOADING_STUCK_MS,
  inventorySteamPathCopyKeys,
  resolveInventorySteamPathReason,
} from './inventory-steam-path.ts';

describe('inventory-steam-path', () => {
  it('routes STEAM_BLOCKED to steam path (empty vs cached)', () => {
    assert.equal(
      resolveInventorySteamPathReason({
        errorCode: 'STEAM_BLOCKED',
        assetsCount: 0,
        loading: false,
      }),
      'steam_blocked',
    );
    assert.equal(
      resolveInventorySteamPathReason({
        errorCode: 'STEAM_BLOCKED',
        assetsCount: 5,
        loading: false,
        stale: true,
      }),
      'stale_cache',
    );
  });

  it('treats long empty loading as stuck', () => {
    assert.equal(
      resolveInventorySteamPathReason({
        assetsCount: 0,
        loading: true,
        emptyWaitMs: INVENTORY_LOADING_STUCK_MS - 1,
      }),
      null,
    );
    assert.equal(
      resolveInventorySteamPathReason({
        assetsCount: 0,
        loading: true,
        emptyWaitMs: INVENTORY_LOADING_STUCK_MS,
      }),
      'loading_stuck',
    );
  });

  it('maps copy keys', () => {
    assert.equal(
      inventorySteamPathCopyKeys('steam_blocked').primaryKey,
      'inventory.steamPathOpenSteam',
    );
  });

  it('treats non-private empty sync errors as sync_failed', () => {
    assert.equal(
      resolveInventorySteamPathReason({
        errorCode: 'INVENTORY_UNAVAILABLE',
        assetsCount: 0,
        loading: false,
      }),
      'sync_failed',
    );
    assert.equal(
      resolveInventorySteamPathReason({
        errorCode: 'STEAM_PROFILE_PRIVATE',
        assetsCount: 0,
        loading: false,
      }),
      null,
    );
  });

  it('offers steam path for soft stale cache', () => {
    assert.equal(
      resolveInventorySteamPathReason({
        stale: true,
        assetsCount: 3,
        loading: false,
      }),
      'stale_cache',
    );
  });
});
