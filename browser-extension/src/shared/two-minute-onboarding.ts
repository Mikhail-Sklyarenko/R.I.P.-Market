/**
 * H5: Two-minute onboarding — Install → Pair → Steam inventory → trial list.
 * Pure view-model + chrome.storage helpers for popup / inventory / SW.
 */
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  type ExtensionLocale,
} from './extension-i18n.js';

export const TWO_MINUTE_ONBOARDING_KEY = 'rip:twoMinuteOnboarding';
export const CS2_INVENTORY_URL =
  'https://steamcommunity.com/my/inventory/#730_2';

export type TwoMinuteOnboardingState = {
  inventoryVisitedAt: string | null;
  firstListAt: string | null;
  wizardDismissed: boolean;
  completedAt: string | null;
  trialHintDismissed: boolean;
};

export type TwoMinuteStepKey = 'install' | 'pair' | 'inventory' | 'list';

export type TwoMinuteStepView = {
  key: TwoMinuteStepKey;
  ready: boolean;
  current: boolean;
  label: string;
  hint: string;
};

export type TwoMinutePrimaryKind =
  | 'open_account'
  | 'open_inventory'
  | 'dismiss'
  | 'none';

export type TwoMinuteOnboardingView = {
  visible: boolean;
  complete: boolean;
  title: string;
  lead: string;
  progressLabel: string;
  steps: TwoMinuteStepView[];
  primary: {
    kind: TwoMinutePrimaryKind;
    label: string;
  };
  dismissLabel: string;
};

export type TrialListHintView = {
  visible: boolean;
  title: string;
  body: string;
  dismissLabel: string;
};

export function defaultTwoMinuteOnboardingState(): TwoMinuteOnboardingState {
  return {
    inventoryVisitedAt: null,
    firstListAt: null,
    wizardDismissed: false,
    completedAt: null,
    trialHintDismissed: false,
  };
}

export function parseTwoMinuteOnboardingState(
  raw: unknown,
): TwoMinuteOnboardingState {
  if (!raw || typeof raw !== 'object') {
    return defaultTwoMinuteOnboardingState();
  }
  const record = raw as Record<string, unknown>;
  const asIso = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value : null;
  return {
    inventoryVisitedAt: asIso(record.inventoryVisitedAt),
    firstListAt: asIso(record.firstListAt),
    wizardDismissed: record.wizardDismissed === true,
    completedAt: asIso(record.completedAt),
    trialHintDismissed: record.trialHintDismissed === true,
  };
}

export function markInventoryVisited(
  state: TwoMinuteOnboardingState,
  nowIso = new Date().toISOString(),
): TwoMinuteOnboardingState {
  if (state.inventoryVisitedAt) {
    return state;
  }
  return { ...state, inventoryVisitedAt: nowIso };
}

export function markFirstList(
  state: TwoMinuteOnboardingState,
  nowIso = new Date().toISOString(),
): TwoMinuteOnboardingState {
  if (state.firstListAt) {
    return state;
  }
  return { ...state, firstListAt: nowIso };
}

export function dismissTwoMinuteWizard(
  state: TwoMinuteOnboardingState,
): TwoMinuteOnboardingState {
  return { ...state, wizardDismissed: true };
}

export function dismissTrialListHint(
  state: TwoMinuteOnboardingState,
): TwoMinuteOnboardingState {
  return { ...state, trialHintDismissed: true };
}

export function withAutoComplete(
  state: TwoMinuteOnboardingState,
  connected: boolean,
  nowIso = new Date().toISOString(),
): TwoMinuteOnboardingState {
  if (state.completedAt) {
    return state;
  }
  const ready =
    connected &&
    Boolean(state.inventoryVisitedAt) &&
    Boolean(state.firstListAt);
  if (!ready) {
    return state;
  }
  return { ...state, completedAt: nowIso };
}

export function isTwoMinuteComplete(
  state: TwoMinuteOnboardingState,
  connected: boolean,
): boolean {
  if (state.completedAt || state.wizardDismissed) {
    return true;
  }
  return (
    connected &&
    Boolean(state.inventoryVisitedAt) &&
    Boolean(state.firstListAt)
  );
}

export function resolveCurrentTwoMinuteStep(params: {
  connected: boolean;
  state: TwoMinuteOnboardingState;
}): TwoMinuteStepKey {
  if (!params.connected) {
    return 'pair';
  }
  if (!params.state.inventoryVisitedAt) {
    return 'inventory';
  }
  if (!params.state.firstListAt) {
    return 'list';
  }
  return 'list';
}

export function resolveTwoMinuteOnboardingView(params: {
  connected: boolean;
  state: TwoMinuteOnboardingState;
  locale?: ExtensionLocale;
}): TwoMinuteOnboardingView {
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);
  const state = withAutoComplete(params.state, params.connected);
  const complete = isTwoMinuteComplete(state, params.connected);
  const visible = !state.wizardDismissed && !state.completedAt;

  const installReady = true;
  const pairReady = params.connected;
  const inventoryReady = Boolean(state.inventoryVisitedAt);
  const listReady = Boolean(state.firstListAt);

  const current = resolveCurrentTwoMinuteStep({
    connected: params.connected,
    state,
  });

  const steps: TwoMinuteStepView[] = [
    {
      key: 'install',
      ready: installReady,
      current: false,
      label: t('twoMin.stepInstall'),
      hint: t('twoMin.hintInstall'),
    },
    {
      key: 'pair',
      ready: pairReady,
      current: current === 'pair',
      label: t('twoMin.stepPair'),
      hint: t('twoMin.hintPair'),
    },
    {
      key: 'inventory',
      ready: inventoryReady,
      current: current === 'inventory',
      label: t('twoMin.stepInventory'),
      hint: t('twoMin.hintInventory'),
    },
    {
      key: 'list',
      ready: listReady,
      current: current === 'list' && !listReady,
      label: t('twoMin.stepList'),
      hint: t('twoMin.hintList'),
    },
  ];

  const readyCount = steps.filter((step) => step.ready).length;
  let primary: TwoMinuteOnboardingView['primary'];
  if (complete || (listReady && pairReady && inventoryReady)) {
    primary = { kind: 'dismiss', label: t('twoMin.ctaDone') };
  } else if (current === 'pair') {
    primary = { kind: 'open_account', label: t('twoMin.ctaPair') };
  } else if (current === 'inventory') {
    primary = { kind: 'open_inventory', label: t('twoMin.ctaInventory') };
  } else {
    primary = { kind: 'open_inventory', label: t('twoMin.ctaList') };
  }

  return {
    visible,
    complete,
    title: t('twoMin.title'),
    lead: t('twoMin.lead'),
    progressLabel: t('twoMin.progress', {
      ready: String(readyCount),
      total: String(steps.length),
    }),
    steps,
    primary,
    dismissLabel: t('twoMin.dismiss'),
  };
}

export function resolveTrialListHintView(params: {
  connected: boolean;
  checklistReady: boolean;
  state: TwoMinuteOnboardingState;
  locale?: ExtensionLocale;
}): TrialListHintView {
  const locale = params.locale ?? DEFAULT_EXTENSION_LOCALE;
  const t = createExtensionT(locale);
  const visible =
    params.connected &&
    params.checklistReady &&
    Boolean(params.state.inventoryVisitedAt) &&
    !params.state.firstListAt &&
    !params.state.trialHintDismissed &&
    !params.state.wizardDismissed;
  return {
    visible,
    title: t('twoMin.trialTitle'),
    body: t('twoMin.trialBody'),
    dismissLabel: t('twoMin.trialDismiss'),
  };
}

export function twoMinuteOnboardingHtml(
  view: TwoMinuteOnboardingView,
  escapeHtml: (value: string) => string,
): string {
  const steps = view.steps
    .map(
      (step) => `<li class="two-min-step" data-ready="${step.ready ? '1' : '0'}" data-current="${step.current ? '1' : '0'}" data-key="${escapeHtml(step.key)}">
        <span class="two-min-mark" aria-hidden="true">${step.ready ? '✓' : step.current ? '→' : '·'}</span>
        <div class="two-min-copy">
          <span class="two-min-label">${escapeHtml(step.label)}</span>
          <p class="two-min-hint">${escapeHtml(step.hint)}</p>
        </div>
      </li>`,
    )
    .join('');

  const primary =
    view.primary.kind === 'none'
      ? ''
      : `<button type="button" class="primary" data-two-min-primary="${escapeHtml(view.primary.kind)}">${escapeHtml(view.primary.label)}</button>`;

  return `
    <div class="two-min-head">
      <p class="two-min-title">${escapeHtml(view.title)}</p>
      <p class="two-min-progress">${escapeHtml(view.progressLabel)}</p>
    </div>
    <p class="two-min-lead">${escapeHtml(view.lead)}</p>
    <ol class="two-min-list">${steps}</ol>
    <div class="two-min-actions">
      ${primary}
      <button type="button" class="secondary" data-two-min-dismiss>${escapeHtml(view.dismissLabel)}</button>
    </div>
  `;
}

export async function getTwoMinuteOnboardingState(): Promise<TwoMinuteOnboardingState> {
  const stored = await chrome.storage.local.get(TWO_MINUTE_ONBOARDING_KEY);
  return parseTwoMinuteOnboardingState(stored[TWO_MINUTE_ONBOARDING_KEY]);
}

export async function setTwoMinuteOnboardingState(
  state: TwoMinuteOnboardingState,
): Promise<void> {
  await chrome.storage.local.set({ [TWO_MINUTE_ONBOARDING_KEY]: state });
}

export async function recordTwoMinuteInventoryVisit(): Promise<TwoMinuteOnboardingState> {
  const next = markInventoryVisited(await getTwoMinuteOnboardingState());
  await setTwoMinuteOnboardingState(next);
  return next;
}

export async function recordTwoMinuteFirstList(): Promise<TwoMinuteOnboardingState> {
  const base = markFirstList(await getTwoMinuteOnboardingState());
  const next = withAutoComplete(base, true);
  await setTwoMinuteOnboardingState(next);
  return next;
}

export async function persistDismissTwoMinuteWizard(): Promise<TwoMinuteOnboardingState> {
  const next = dismissTwoMinuteWizard(await getTwoMinuteOnboardingState());
  await setTwoMinuteOnboardingState(next);
  return next;
}

export async function persistDismissTrialListHint(): Promise<TwoMinuteOnboardingState> {
  const next = dismissTrialListHint(await getTwoMinuteOnboardingState());
  await setTwoMinuteOnboardingState(next);
  return next;
}
