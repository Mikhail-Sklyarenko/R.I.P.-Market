export type ExtensionRolloutStage = 'off' | 'internal' | 'allowlist' | 'percent';

export function isExtensionRolloutEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_ROLLOUT === 'true';
}

export function isExtensionRolloutKillSwitchActive(): boolean {
  return process.env.EXTENSION_ROLLOUT_KILL_SWITCH === 'true';
}

export function isExtensionRolloutInflightGraceEnabled(): boolean {
  return process.env.EXTENSION_ROLLOUT_INFLIGHT_GRACE !== 'false';
}

export function getExtensionRolloutStage(): ExtensionRolloutStage {
  const raw = (process.env.EXTENSION_ROLLOUT_STAGE ?? 'off').toLowerCase();
  if (
    raw === 'internal' ||
    raw === 'allowlist' ||
    raw === 'percent'
  ) {
    return raw;
  }
  return 'off';
}

export function getExtensionRolloutPercent(): number {
  const value = Number(process.env.EXTENSION_ROLLOUT_PERCENT ?? 0);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.floor(value)));
}

export function getExtensionRolloutInternalUserIds(): Set<string> {
  return parseCsvSet(process.env.EXTENSION_ROLLOUT_INTERNAL_USER_IDS);
}

export function getExtensionRolloutInternalSteamIds(): Set<string> {
  return parseCsvSet(process.env.EXTENSION_ROLLOUT_INTERNAL_STEAM_IDS);
}

export function getExtensionRolloutEnvAllowlistSteamIds(): Set<string> {
  return parseCsvSet(process.env.EXTENSION_ROLLOUT_ALLOWLIST_STEAM_IDS);
}

export type ExtensionFeatureFlagSnapshot = {
  ENABLE_EXTENSION_CHANNEL: boolean;
  ENABLE_EXTENSION_FIRST_TRADE_FLOW: boolean;
  ENABLE_EXTENSION_TASK_PIPELINE: boolean;
  ENABLE_EXTENSION_OFFER_ORCHESTRATOR: boolean;
  ENABLE_EXTENSION_TRADE_REFERENCE: boolean;
  ENABLE_DELIVERY_VERIFICATION_ENGINE: boolean;
  ENABLE_SETTLEMENT_HOLD_WINDOW: boolean;
  ENABLE_EXTENSION_DISPUTE_BRIDGE: boolean;
  ENABLE_EXTENSION_FLOW_OBSERVABILITY: boolean;
  ENABLE_EXTENSION_ROLLOUT: boolean;
  EXTENSION_ROLLOUT_KILL_SWITCH: boolean;
  EXTENSION_ROLLOUT_INFLIGHT_GRACE: boolean;
};

export function snapshotExtensionFeatureFlags(): ExtensionFeatureFlagSnapshot {
  return {
    ENABLE_EXTENSION_CHANNEL: process.env.ENABLE_EXTENSION_CHANNEL === 'true',
    ENABLE_EXTENSION_FIRST_TRADE_FLOW:
      process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW === 'true',
    ENABLE_EXTENSION_TASK_PIPELINE:
      process.env.ENABLE_EXTENSION_TASK_PIPELINE === 'true',
    ENABLE_EXTENSION_OFFER_ORCHESTRATOR:
      process.env.ENABLE_EXTENSION_OFFER_ORCHESTRATOR === 'true',
    ENABLE_EXTENSION_TRADE_REFERENCE:
      process.env.ENABLE_EXTENSION_TRADE_REFERENCE === 'true',
    ENABLE_DELIVERY_VERIFICATION_ENGINE:
      process.env.ENABLE_DELIVERY_VERIFICATION_ENGINE === 'true',
    ENABLE_SETTLEMENT_HOLD_WINDOW:
      process.env.ENABLE_SETTLEMENT_HOLD_WINDOW === 'true',
    ENABLE_EXTENSION_DISPUTE_BRIDGE:
      process.env.ENABLE_EXTENSION_DISPUTE_BRIDGE === 'true',
    ENABLE_EXTENSION_FLOW_OBSERVABILITY:
      process.env.ENABLE_EXTENSION_FLOW_OBSERVABILITY === 'true',
    ENABLE_EXTENSION_ROLLOUT: isExtensionRolloutEnabled(),
    EXTENSION_ROLLOUT_KILL_SWITCH: isExtensionRolloutKillSwitchActive(),
    EXTENSION_ROLLOUT_INFLIGHT_GRACE: isExtensionRolloutInflightGraceEnabled(),
  };
}

function parseCsvSet(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}
