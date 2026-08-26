import { describe, expect, it } from 'vitest';
import {
  COACH_AUTO_DISMISS_MS,
  defaultOnboardingState,
  dismissCoachMark,
  hasValidTradeUrl,
  markCoachSeen,
  parseOnboardingState,
  resolveCoachMarkView,
  resolveSellerChecklistView,
  shouldShowCoachMark,
} from './inventory-seller-onboarding.js';

describe('inventory-seller-onboarding', () => {
  it('shows coach until dismissed and auto-dismiss window is 30s', () => {
    const initial = defaultOnboardingState();
    expect(shouldShowCoachMark(initial)).toBe(true);
    expect(resolveCoachMarkView({ state: initial }).autoDismissMs).toBe(
      COACH_AUTO_DISMISS_MS,
    );
    expect(resolveCoachMarkView({ state: initial }).body).toMatch(
      /обмен при покупке/i,
    );

    const seen = markCoachSeen(initial, '2026-08-26T00:00:00.000Z');
    expect(seen.coachSeenAt).toBe('2026-08-26T00:00:00.000Z');
    expect(shouldShowCoachMark(seen)).toBe(true);

    const dismissed = dismissCoachMark(seen, '2026-08-26T00:00:30.000Z');
    expect(dismissed.coachDismissed).toBe(true);
    expect(shouldShowCoachMark(dismissed)).toBe(false);
  });

  it('parses stored onboarding state safely', () => {
    expect(parseOnboardingState(null)).toEqual(defaultOnboardingState());
    expect(
      parseOnboardingState({
        coachDismissed: true,
        coachSeenAt: '2026-08-26T12:00:00.000Z',
      }),
    ).toEqual({
      coachDismissed: true,
      coachSeenAt: '2026-08-26T12:00:00.000Z',
    });
  });

  it('builds Trade URL + extension checklist', () => {
    const pending = resolveSellerChecklistView({
      extensionConnected: false,
      tradeUrl: null,
      accountUrl: 'https://p2pcs.ru/account',
    });
    expect(pending.allReady).toBe(false);
    expect(pending.readyCount).toBe(0);
    expect(pending.items[0]?.actionHref).toContain('/account');
    expect(pending.items[1]?.actionHref).toContain('trade-url');

    const ready = resolveSellerChecklistView({
      extensionConnected: true,
      tradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=123&token=abc',
      accountUrl: 'https://p2pcs.ru/account',
    });
    expect(ready.allReady).toBe(true);
    expect(ready.summaryLine).toMatch(/готово/i);
  });

  it('validates Steam trade URL shape', () => {
    expect(
      hasValidTradeUrl(
        'https://steamcommunity.com/tradeoffer/new/?partner=1&token=x',
      ),
    ).toBe(true);
    expect(hasValidTradeUrl('https://example.com')).toBe(false);
    expect(hasValidTradeUrl('')).toBe(false);
  });
});
