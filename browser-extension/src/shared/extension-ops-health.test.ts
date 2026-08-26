import { describe, expect, it } from 'vitest';
import {
  buildOpsHealthView,
  defaultOpsHealthPollState,
  formatRelativePollAge,
  isRateLimitActive,
  markActiveTradesPollOk,
  markRateLimited,
  markTaskPollOk,
  POLL_STALE_ERROR_MS,
  POLL_STALE_WARN_MS,
  resolveLastSuccessfulPollAt,
  resolvePollTone,
} from './extension-ops-health.js';

describe('extension-ops-health', () => {
  it('tracks last successful poll across task and trades polls', () => {
    let state = defaultOpsHealthPollState();
    state = markTaskPollOk(state, '2026-08-26T12:00:00.000Z');
    state = markActiveTradesPollOk(state, '2026-08-26T12:01:00.000Z');
    expect(resolveLastSuccessfulPollAt(state)).toBe(
      '2026-08-26T12:01:00.000Z',
    );
  });

  it('formats relative age and poll tones', () => {
    const now = Date.parse('2026-08-26T12:00:00.000Z');
    expect(formatRelativePollAge(null, now)).toBe('ещё не было');
    expect(
      formatRelativePollAge('2026-08-26T11:59:50.000Z', now),
    ).toBe('только что');
    expect(
      formatRelativePollAge('2026-08-26T11:58:00.000Z', now),
    ).toBe('2 мин назад');

    expect(
      resolvePollTone({
        lastSuccessfulPollAt: '2026-08-26T11:59:30.000Z',
        connected: true,
        nowMs: now,
      }),
    ).toBe('ok');
    expect(
      resolvePollTone({
        lastSuccessfulPollAt: new Date(now - POLL_STALE_WARN_MS - 1).toISOString(),
        connected: true,
        nowMs: now,
      }),
    ).toBe('warn');
    expect(
      resolvePollTone({
        lastSuccessfulPollAt: new Date(now - POLL_STALE_ERROR_MS - 1).toISOString(),
        connected: true,
        nowMs: now,
      }),
    ).toBe('error');
  });

  it('keeps rate-limit active inside the quiet window', () => {
    const now = Date.parse('2026-08-26T12:00:00.000Z');
    const state = markRateLimited(
      defaultOpsHealthPollState(),
      '2026-08-26T11:59:00.000Z',
    );
    expect(
      isRateLimitActive({
        lastRateLimitedAt: state.lastRateLimitedAt,
        nowMs: now,
      }),
    ).toBe(true);
    expect(
      isRateLimitActive({
        lastRateLimitedAt: '2026-08-26T11:50:00.000Z',
        nowMs: now,
      }),
    ).toBe(false);
  });

  it('builds popup health lines with version update CTA', () => {
    const view = buildOpsHealthView({
      snapshot: {
        poll: markTaskPollOk(
          defaultOpsHealthPollState(),
          '2026-08-26T11:59:50.000Z',
        ),
        rateLimited: true,
        rateLimitCheckedAt: '2026-08-26T12:00:00.000Z',
        rateLimitMessage: 'Steam: rate limit',
        extensionVersion: '0.6.10',
        updateUrl: 'https://example.com/releases',
        connected: true,
      },
      nowMs: Date.parse('2026-08-26T12:00:00.000Z'),
    });
    expect(view.pollLine).toMatch(/опрос/i);
    expect(view.rateLimitTone).toBe('warn');
    expect(view.versionLine).toBe('Версия 0.6.10');
    expect(view.updateLabel).toMatch(/обновить/i);
    expect(view.updateUrl).toContain('releases');
  });
});
