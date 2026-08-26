import { describe, expect, it } from 'vitest';
import {
  defaultTwoMinuteOnboardingState,
  dismissTwoMinuteWizard,
  isTwoMinuteComplete,
  markFirstList,
  markInventoryVisited,
  parseTwoMinuteOnboardingState,
  resolveCurrentTwoMinuteStep,
  resolveTrialListHintView,
  resolveTwoMinuteOnboardingView,
  withAutoComplete,
} from './two-minute-onboarding.js';

describe('two-minute-onboarding (H5)', () => {
  it('parses state and advances install → pair → inventory → list', () => {
    expect(parseTwoMinuteOnboardingState(null)).toEqual(
      defaultTwoMinuteOnboardingState(),
    );

    expect(
      resolveCurrentTwoMinuteStep({
        connected: false,
        state: defaultTwoMinuteOnboardingState(),
      }),
    ).toBe('pair');

    expect(
      resolveCurrentTwoMinuteStep({
        connected: true,
        state: defaultTwoMinuteOnboardingState(),
      }),
    ).toBe('inventory');

    const visited = markInventoryVisited(
      defaultTwoMinuteOnboardingState(),
      '2026-08-27T01:00:00.000Z',
    );
    expect(
      resolveCurrentTwoMinuteStep({ connected: true, state: visited }),
    ).toBe('list');

    const listed = markFirstList(visited, '2026-08-27T01:01:00.000Z');
    expect(listed.firstListAt).toBe('2026-08-27T01:01:00.000Z');
  });

  it('builds popup wizard with pair CTA when disconnected', () => {
    const view = resolveTwoMinuteOnboardingView({
      connected: false,
      state: defaultTwoMinuteOnboardingState(),
      locale: 'ru',
    });
    expect(view.visible).toBe(true);
    expect(view.steps[0]?.ready).toBe(true);
    expect(view.steps[1]?.current).toBe(true);
    expect(view.primary.kind).toBe('open_account');
    expect(view.progressLabel).toMatch(/1 из 4/);
  });

  it('points to inventory then trial list after pair', () => {
    const afterPair = resolveTwoMinuteOnboardingView({
      connected: true,
      state: defaultTwoMinuteOnboardingState(),
      locale: 'en',
    });
    expect(afterPair.primary.kind).toBe('open_inventory');
    expect(afterPair.primary.label).toMatch(/inventory/i);

    const afterVisit = resolveTwoMinuteOnboardingView({
      connected: true,
      state: markInventoryVisited(defaultTwoMinuteOnboardingState()),
      locale: 'en',
    });
    expect(afterVisit.primary.kind).toBe('open_inventory');
    expect(afterVisit.primary.label).toMatch(/list|skin/i);
  });

  it('auto-completes and hides after first list; dismiss skips', () => {
    const listed = withAutoComplete(
      markFirstList(
        markInventoryVisited(defaultTwoMinuteOnboardingState()),
      ),
      true,
      '2026-08-27T02:00:00.000Z',
    );
    expect(listed.completedAt).toBe('2026-08-27T02:00:00.000Z');
    expect(isTwoMinuteComplete(listed, true)).toBe(true);
    expect(
      resolveTwoMinuteOnboardingView({ connected: true, state: listed })
        .visible,
    ).toBe(false);

    const dismissed = dismissTwoMinuteWizard(defaultTwoMinuteOnboardingState());
    expect(
      resolveTwoMinuteOnboardingView({ connected: false, state: dismissed })
        .visible,
    ).toBe(false);
  });

  it('shows trial hint only when checklist ready and list not done', () => {
    const state = markInventoryVisited(defaultTwoMinuteOnboardingState());
    expect(
      resolveTrialListHintView({
        connected: true,
        checklistReady: true,
        state,
        locale: 'ru',
      }).visible,
    ).toBe(true);

    expect(
      resolveTrialListHintView({
        connected: true,
        checklistReady: false,
        state,
      }).visible,
    ).toBe(false);

    expect(
      resolveTrialListHintView({
        connected: true,
        checklistReady: true,
        state: markFirstList(state),
      }).visible,
    ).toBe(false);
  });
});
