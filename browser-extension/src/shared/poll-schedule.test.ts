import { describe, expect, it } from 'vitest';
import {
  isDealActiveTrade,
  periodsForPollMode,
  resolvePollScheduleMode,
  ACTIVE_POLL_SCHEDULE,
  IDLE_POLL_SCHEDULE,
} from './poll-schedule.js';

describe('poll-schedule (I4)', () => {
  it('treats WAITING_TRADE and actionable nextActions as active deals', () => {
    expect(isDealActiveTrade({ orderStatus: 'WAITING_TRADE' })).toBe(true);
    expect(
      isDealActiveTrade({
        orderStatus: 'COMPLETED',
        nextAction: { kind: 'confirm_guard' },
      }),
    ).toBe(true);
    expect(isDealActiveTrade({ orderStatus: 'COMPLETED' })).toBe(false);
  });

  it('resolves active from trades, pending tasks, or backend hint', () => {
    expect(resolvePollScheduleMode({ trades: [] })).toBe('idle');
    expect(
      resolvePollScheduleMode({
        trades: [{ orderStatus: 'WAITING_TRADE' }],
      }),
    ).toBe('active');
    expect(resolvePollScheduleMode({ pendingTaskCount: 1 })).toBe('active');
    expect(
      resolvePollScheduleMode({ backendHasPendingWork: true }),
    ).toBe('active');
    expect(
      resolvePollScheduleMode({ backendHasActiveDeal: true }),
    ).toBe('active');
  });

  it('exposes calmer idle periods than active', () => {
    expect(periodsForPollMode('idle')).toEqual(IDLE_POLL_SCHEDULE);
    expect(periodsForPollMode('active')).toEqual(ACTIVE_POLL_SCHEDULE);
    expect(ACTIVE_POLL_SCHEDULE.tasksMinutes).toBeLessThan(
      IDLE_POLL_SCHEDULE.tasksMinutes,
    );
  });
});
