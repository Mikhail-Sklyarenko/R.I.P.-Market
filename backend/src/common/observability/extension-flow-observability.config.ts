export function isExtensionFlowObservabilityEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_FLOW_OBSERVABILITY === 'true';
}

export function isExtensionRateLimitsEnabled(): boolean {
  return (
    isExtensionFlowObservabilityEnabled() &&
    process.env.ENABLE_EXTENSION_RATE_LIMITS === 'true'
  );
}

export function isExtensionAntiFraudEnabled(): boolean {
  return (
    isExtensionFlowObservabilityEnabled() &&
    process.env.ENABLE_EXTENSION_ANTI_FRAUD === 'true'
  );
}

export type ExtensionFlowAlertThresholds = {
  taskFailureSpike5m: number;
  authErrorSpike5m: number;
  verifyMismatchSpike5m: number;
  disputeRateMinSample: number;
  disputeRateMaxPct: number;
  completionRateMinSample: number;
  completionRateMinPct: number;
  taskSuccessRateMinSample: number;
  taskSuccessRateMinPct: number;
};

export function extensionFlowAlertThresholds(): ExtensionFlowAlertThresholds {
  return {
    taskFailureSpike5m: parsePositiveInt(
      process.env.EXT_FLOW_ALERT_TASK_FAIL_SPIKE_5M,
      10,
    ),
    authErrorSpike5m: parsePositiveInt(
      process.env.EXT_FLOW_ALERT_AUTH_SPIKE_5M,
      15,
    ),
    verifyMismatchSpike5m: parsePositiveInt(
      process.env.EXT_FLOW_ALERT_VERIFY_MISMATCH_SPIKE_5M,
      5,
    ),
    disputeRateMinSample: parsePositiveInt(
      process.env.EXT_FLOW_ALERT_DISPUTE_MIN_SAMPLE,
      20,
    ),
    disputeRateMaxPct: parsePositiveInt(
      process.env.EXT_FLOW_ALERT_DISPUTE_MAX_PCT,
      15,
    ),
    completionRateMinSample: parsePositiveInt(
      process.env.EXT_FLOW_ALERT_COMPLETION_MIN_SAMPLE,
      20,
    ),
    completionRateMinPct: parsePositiveInt(
      process.env.EXT_FLOW_ALERT_COMPLETION_MIN_PCT,
      70,
    ),
    taskSuccessRateMinSample: parsePositiveInt(
      process.env.EXT_FLOW_ALERT_TASK_SUCCESS_MIN_SAMPLE,
      20,
    ),
    taskSuccessRateMinPct: parsePositiveInt(
      process.env.EXT_FLOW_ALERT_TASK_SUCCESS_MIN_PCT,
      85,
    ),
  };
}

export type ExtensionRateLimitConfig = {
  handshakePerUserPerHour: number;
  signedRequestsPerSessionPerMinute: number;
  tradeReferencePerUserPerMinute: number;
};

export function extensionRateLimitConfig(): ExtensionRateLimitConfig {
  return {
    handshakePerUserPerHour: parsePositiveInt(
      process.env.EXT_FLOW_RL_HANDSHAKE_PER_HOUR,
      30,
    ),
    signedRequestsPerSessionPerMinute: parsePositiveInt(
      process.env.EXT_FLOW_RL_SIGNED_PER_MIN,
      120,
    ),
    tradeReferencePerUserPerMinute: parsePositiveInt(
      process.env.EXT_FLOW_RL_TRADE_REF_PER_MIN,
      20,
    ),
  };
}

export type AntiFraudRuleThresholds = {
  disputesPerUserPerHour: number;
  authFailuresPerUserPer5m: number;
  taskFailuresPerSellerPer10m: number;
  handshakesPerUserPerHour: number;
};

export function antiFraudRuleThresholds(): AntiFraudRuleThresholds {
  return {
    disputesPerUserPerHour: parsePositiveInt(
      process.env.EXT_FLOW_AF_DISPUTES_PER_HOUR,
      3,
    ),
    authFailuresPerUserPer5m: parsePositiveInt(
      process.env.EXT_FLOW_AF_AUTH_FAIL_5M,
      10,
    ),
    taskFailuresPerSellerPer10m: parsePositiveInt(
      process.env.EXT_FLOW_AF_TASK_FAIL_10M,
      5,
    ),
    handshakesPerUserPerHour: parsePositiveInt(
      process.env.EXT_FLOW_AF_HANDSHAKE_PER_HOUR,
      20,
    ),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
