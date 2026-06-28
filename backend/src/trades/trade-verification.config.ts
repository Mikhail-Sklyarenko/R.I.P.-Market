export type TradeVerificationMode = 'off' | 'shadow' | 'live';

const LEGACY_MODE_MAP: Record<string, TradeVerificationMode> = {
  off: 'off',
  shadow: 'shadow',
  live: 'live',
  steam_poll: 'live',
};

export function getTradeVerificationMode(): TradeVerificationMode {
  const raw = (process.env.TRADE_VERIFICATION_MODE ?? 'live').toLowerCase();
  return LEGACY_MODE_MAP[raw] ?? 'live';
}

export function isShadowVerificationMode(): boolean {
  return getTradeVerificationMode() === 'shadow';
}

export function isLiveVerificationMode(): boolean {
  return getTradeVerificationMode() === 'live';
}

export function resolveOrderVerificationMode(): string {
  const mode = getTradeVerificationMode();
  if (mode === 'off') {
    return 'OFF';
  }
  if (mode === 'shadow') {
    return 'SHADOW';
  }
  return 'STEAM_POLL';
}

export function assertShadowModeConfig(): void {
  if (!isShadowVerificationMode()) {
    return;
  }
  if (process.env.ENABLE_REAL_SETTLEMENT === 'true') {
    throw new Error(
      'ENABLE_REAL_SETTLEMENT must be false when TRADE_VERIFICATION_MODE=shadow',
    );
  }
}
