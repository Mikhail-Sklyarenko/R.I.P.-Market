import { describe, expect, it } from 'vitest';
import {
  POLL_STALE_ERROR_MS,
  POLL_STALE_WARN_MS,
} from './extension-ops-health.js';
import {
  applySafeModeToNextAction,
  buildSafeModeBanner,
  buildSiteLinkSnapshot,
  isNetworkishError,
  isSafeModeMutationBlocked,
  resolveSiteLinkMode,
} from './offline-safe-mode.js';
import type { ResolvedNextAction } from './popup-next-action.js';

const now = Date.parse('2026-08-27T12:00:00.000Z');

describe('offline-safe-mode (H4)', () => {
  it('detects network-ish errors', () => {
    expect(isNetworkishError('Failed to fetch')).toBe(true);
    expect(isNetworkishError('HTTP 500')).toBe(false);
  });

  it('resolves live / degraded / offline from telemetry', () => {
    expect(
      resolveSiteLinkMode({
        paired: true,
        lastSuccessfulPollAt: new Date(now - 10_000).toISOString(),
        lastPollErrorAt: null,
        lastPollErrorMessage: null,
        nowMs: now,
      }),
    ).toBe('live');

    expect(
      resolveSiteLinkMode({
        paired: true,
        lastSuccessfulPollAt: new Date(
          now - POLL_STALE_WARN_MS - 1_000,
        ).toISOString(),
        lastPollErrorAt: null,
        lastPollErrorMessage: null,
        nowMs: now,
      }),
    ).toBe('degraded');

    expect(
      resolveSiteLinkMode({
        paired: true,
        lastSuccessfulPollAt: new Date(
          now - POLL_STALE_ERROR_MS - 1_000,
        ).toISOString(),
        lastPollErrorAt: null,
        lastPollErrorMessage: null,
        nowMs: now,
      }),
    ).toBe('offline');

    expect(
      resolveSiteLinkMode({
        paired: true,
        lastSuccessfulPollAt: new Date(now - 30_000).toISOString(),
        lastPollErrorAt: new Date(now - 5_000).toISOString(),
        lastPollErrorMessage: 'Failed to fetch',
        liveFetchOk: false,
        nowMs: now,
      }),
    ).toBe('degraded');

    expect(
      resolveSiteLinkMode({
        paired: true,
        lastSuccessfulPollAt: new Date(
          now - POLL_STALE_ERROR_MS - 1_000,
        ).toISOString(),
        lastPollErrorAt: new Date(now - 5_000).toISOString(),
        lastPollErrorMessage: 'Failed to fetch',
        liveFetchOk: false,
        nowMs: now,
      }),
    ).toBe('offline');

    expect(
      resolveSiteLinkMode({
        paired: false,
        lastSuccessfulPollAt: null,
        lastPollErrorAt: null,
        lastPollErrorMessage: null,
        nowMs: now,
      }),
    ).toBe('offline');
  });

  it('marks safeMode for non-live snapshots and blocks mutations', () => {
    const live = buildSiteLinkSnapshot({ mode: 'live', nowMs: now });
    const offline = buildSiteLinkSnapshot({
      mode: 'offline',
      fromCache: true,
      cacheUpdatedAt: new Date(now - 60_000).toISOString(),
      nowMs: now,
    });
    expect(live.safeMode).toBe(false);
    expect(offline.safeMode).toBe(true);
    expect(isSafeModeMutationBlocked(offline.safeMode, 'list')).toBe(true);
    expect(isSafeModeMutationBlocked(live.safeMode, 'send')).toBe(false);
  });

  it('replaces list/send CTAs but keeps Guard / Accept / dispute', () => {
    const sendPrimary: ResolvedNextAction = {
      primary: {
        id: 'retry_send',
        label: 'Retry',
        mode: 'runtime',
        runtime: 'poll_now',
      },
      overflow: [
        {
          id: 'open_trade_url',
          label: 'Trade URL',
          mode: 'link',
          href: 'https://steamcommunity.com/tradeoffer/new/',
        },
        {
          id: 'open_dispute',
          label: 'Dispute',
          mode: 'link',
          href: 'https://p2pcs.ru/support',
        },
      ],
      hint: null,
    };
    const gated = applySafeModeToNextAction(sendPrimary, true, 'en');
    expect(gated.primary.id).toBe('wait_seller');
    expect(gated.primary.mode).toBe('runtime');
    expect(gated.overflow.map((c) => c.id)).toEqual(['open_dispute']);
    expect(gated.hint).toMatch(/safe mode/i);

    const acceptPrimary: ResolvedNextAction = {
      primary: {
        id: 'open_verified_offer',
        label: 'Open offer',
        mode: 'link',
        href: 'https://steamcommunity.com/tradeoffer/1/',
      },
      overflow: [],
      hint: null,
    };
    const kept = applySafeModeToNextAction(acceptPrimary, true, 'en');
    expect(kept.primary.id).toBe('open_verified_offer');
  });

  it('builds calm offline banner with cache line', () => {
    const banner = buildSafeModeBanner(
      buildSiteLinkSnapshot({
        mode: 'offline',
        fromCache: true,
        cacheUpdatedAt: '2026-08-27T11:00:00.000Z',
        nowMs: now,
      }),
      'ru',
    );
    expect(banner?.tone).toBe('error');
    expect(banner?.title).toMatch(/безопасный режим/i);
    expect(banner?.cacheLine).toMatch(/кэш/i);
    expect(buildSafeModeBanner(buildSiteLinkSnapshot({ mode: 'live' }))).toBe(
      null,
    );
  });
});
