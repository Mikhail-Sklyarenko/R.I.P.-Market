import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideInventorySyncPoll,
  nextInventorySyncPollDelayMs,
} from './inventory-sync-poll.ts';

describe('inventory-sync-poll', () => {
  it('backs off toward 15s without giving up before 90s', () => {
    assert.equal(nextInventorySyncPollDelayMs(0), 2_500);
    assert.equal(nextInventorySyncPollDelayMs(1), 5_000);
    assert.equal(nextInventorySyncPollDelayMs(2), 10_000);
    assert.equal(nextInventorySyncPollDelayMs(3), 15_000);
    assert.equal(nextInventorySyncPollDelayMs(8), 15_000);
  });

  it('keeps polling stale inventory while Steam is still in flight', () => {
    assert.equal(
      decideInventorySyncPoll({
        stale: true,
        backgroundPending: true,
        elapsedMs: 8_000,
      }),
      'poll',
    );
  });

  it('stops when the copy is fresh', () => {
    assert.equal(
      decideInventorySyncPoll({
        stale: false,
        backgroundPending: false,
        elapsedMs: 5_000,
      }),
      'fresh',
    );
  });

  it('stops on a terminal Steam error once the background job is idle', () => {
    assert.equal(
      decideInventorySyncPoll({
        stale: true,
        backgroundPending: false,
        errorCode: 'STEAM_BLOCKED',
        elapsedMs: 4_000,
      }),
      'failed',
    );
  });

  it('times out after 90s even if Steam is still pending', () => {
    assert.equal(
      decideInventorySyncPoll({
        stale: true,
        backgroundPending: true,
        elapsedMs: 90_000,
      }),
      'timeout',
    );
  });
});
