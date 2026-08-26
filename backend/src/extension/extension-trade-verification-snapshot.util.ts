import type {
  ActiveTradeNextAction,
  TradeVerificationCheck,
  TradeVerificationStatus,
} from './extension-trade-ack.types';

/** Persisted extension overlay/verify results for site sync (B4). */
export const EXTENSION_VERIFY_SNAPSHOT_SOURCE = 'EXTENSION';

export type OrderTradeVerificationDto = {
  status: TradeVerificationStatus;
  match: boolean;
  updatedAt: string;
  offerId: string | null;
  failedChecks: Array<{
    key: string;
    label: string;
    severity: 'ok' | 'warn' | 'error';
  }>;
  nextAction: ActiveTradeNextAction | null;
};

type SnapshotRow = {
  observedStatus: string;
  match: boolean;
  createdAt: Date | string;
  payload: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function mapNextAction(value: unknown): ActiveTradeNextAction | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const kind = typeof record.kind === 'string' ? record.kind : null;
  const title = typeof record.title === 'string' ? record.title : null;
  const description =
    typeof record.description === 'string' ? record.description : null;
  if (!kind || !title || !description) {
    return null;
  }
  return {
    kind: kind as ActiveTradeNextAction['kind'],
    title,
    description,
  };
}

function mapFailedChecks(value: unknown): OrderTradeVerificationDto['failedChecks'] {
  if (!Array.isArray(value)) {
    return [];
  }
  const failed: OrderTradeVerificationDto['failedChecks'] = [];
  for (const entry of value) {
    const check = asRecord(entry);
    if (!check) {
      continue;
    }
    if (check.passed === true) {
      continue;
    }
    const key = typeof check.key === 'string' ? check.key : null;
    const label = typeof check.label === 'string' ? check.label : null;
    const severity =
      check.severity === 'ok' ||
      check.severity === 'warn' ||
      check.severity === 'error'
        ? check.severity
        : 'error';
    if (!key || !label) {
      continue;
    }
    failed.push({ key, label, severity });
  }
  return failed;
}

function normalizeStatus(value: string): TradeVerificationStatus {
  if (
    value === 'verified' ||
    value === 'partial' ||
    value === 'mismatch' ||
    value === 'pending'
  ) {
    return value;
  }
  return 'pending';
}

/**
 * Maps latest EXTENSION TradeVerificationSnapshot row → order API field.
 */
export function mapExtensionVerificationSnapshot(
  snapshot: SnapshotRow | null | undefined,
): OrderTradeVerificationDto | null {
  if (!snapshot) {
    return null;
  }
  const payload = asRecord(snapshot.payload) ?? {};
  const offerId =
    typeof payload.offerId === 'string' && payload.offerId.trim()
      ? payload.offerId.trim()
      : null;
  const status = normalizeStatus(snapshot.observedStatus);
  const nextAction =
    mapNextAction(payload.nextAction) ??
    (status === 'mismatch'
      ? {
          kind: 'report_issue' as const,
          title: 'Обмен не совпадает с заказом',
          description:
            'Не принимайте этот trade offer. Откройте заказ на R.I.P Market.',
        }
      : null);

  return {
    status,
    match: snapshot.match,
    updatedAt:
      snapshot.createdAt instanceof Date
        ? snapshot.createdAt.toISOString()
        : String(snapshot.createdAt),
    offerId,
    failedChecks: mapFailedChecks(payload.checks),
    nextAction,
  };
}

export function buildExtensionVerificationPayload(params: {
  checks: TradeVerificationCheck[];
  nextAction: ActiveTradeNextAction;
  offerId: string | null;
  role: 'buyer' | 'seller';
  observed?: {
    assetId?: string | null;
    floatValue?: string | null;
  };
}): Record<string, unknown> {
  return {
    checks: params.checks,
    nextAction: params.nextAction,
    offerId: params.offerId,
    role: params.role,
    observed: {
      assetId: params.observed?.assetId ?? null,
      floatValue: params.observed?.floatValue ?? null,
    },
  };
}

export function shouldPersistExtensionVerification(params: {
  status: TradeVerificationStatus;
  observed?: {
    assetId?: string | null;
    floatValue?: string | null;
  };
}): boolean {
  if (params.status === 'mismatch') {
    return true;
  }
  const assetId = params.observed?.assetId?.trim();
  const floatValue = params.observed?.floatValue?.trim();
  return Boolean(assetId || floatValue);
}
