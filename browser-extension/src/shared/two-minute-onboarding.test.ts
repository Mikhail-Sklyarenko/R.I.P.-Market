import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultTwoMinuteOnboardingState,
  dismissTwoMinuteWizard,
  getTwoMinuteOnboardingState,
  isTwoMinuteComplete,
  markFirstList,
  markInventoryVisited,
  parseTwoMinuteOnboardingState,
  resolveCurrentTwoMinuteStep,
  resolveTrialListHintView,
  resolveTwoMinuteOnboardingView,
  setTwoMinuteOnboardingState,
  twoMinuteOnboardingHtml,
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
    expect(view.progressLabel).toMatch(/1\s*\/\s*4/);
  });

  it('renders compact focus HTML for the current step only', () => {
    const view = resolveTwoMinuteOnboardingView({
      connected: false,
      state: defaultTwoMinuteOnboardingState(),
      locale: 'ru',
    });
    const html = twoMinuteOnboardingHtml(view, (value) => value);
    expect(html).toContain('two-min-focus-label');
    expect(html).toContain('Подключить к сайту');
    expect(html).toContain('two-min-track');
    expect(html).not.toContain('two-min-list');
    expect(html).not.toContain('Расширение установлено');
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

  describe('storage under invalidated extension context', () => {
    beforeEach(() => {
      vi.stubGlobal('chrome', {
        runtime: { id: 'rip-test' },
        storage: {
          local: {
            get: vi.fn(async () => {
              throw new Error('Extension context invalidated.');
            }),
            set: vi.fn(async () => {
              throw new Error('Extension context invalidated.');
            }),
          },
        },
      });
    });

    it('returns default state instead of throwing on get', async () => {
      await expect(getTwoMinuteOnboardingState()).resolves.toEqual(
        defaultTwoMinuteOnboardingState(),
      );
    });

    it('no-ops set instead of throwing', async () => {
      await expect(
        setTwoMinuteOnboardingState(defaultTwoMinuteOnboardingState()),
      ).resolves.toBeUndefined();
    });
  });
});
