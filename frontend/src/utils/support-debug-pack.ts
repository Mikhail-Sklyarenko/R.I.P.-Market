import type { Order } from '../api/types.ts';
import type { ExtensionRuntimeStatus } from './extension.ts';
import { getExtensionId } from './extension.ts';

export type SupportDebugPack = {
  version: 1;
  capturedAt: string;
  orderId: string;
  orderStatus: string;
  role: 'buyer' | 'seller' | 'other';
  offerId: string | null;
  tradeTask: {
    status: string | null;
    executionPhase: string | null;
    lastErrorCode: string | null;
    attemptCount: number | null;
    maxAttempts: number | null;
    confirmPending: boolean;
  } | null;
  deliveryProbe: {
    offerStatus: string | null;
    outcome: string | null;
    reasonCode: string | null;
  } | null;
  tradeVerification: {
    status: string | null;
    match: boolean | null;
    failedCheckKeys: string[];
    nextActionKind: string | null;
  } | null;
  extension: {
    id: string | null;
    connected: boolean;
    expiresAt: string | null;
    sessionHealthCode?: string | null;
  };
  locale: string;
  userAgent: string;
};

export function buildSupportDebugPack(params: {
  order: Order;
  role: 'buyer' | 'seller' | 'other';
  extensionStatus?: ExtensionRuntimeStatus | null;
  sessionHealthCode?: string | null;
  locale: string;
}): SupportDebugPack {
  const task = params.order.tradeTask;
  const probe = params.order.deliveryProbe;
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    orderId: params.order.id,
    orderStatus: params.order.status,
    role: params.role,
    offerId: params.order.tradeOperation?.externalOfferId ?? null,
    tradeTask: task
      ? {
          status: task.status ?? null,
          executionPhase: task.executionPhase ?? null,
          lastErrorCode: task.lastErrorCode ?? null,
          attemptCount: task.attemptCount ?? null,
          maxAttempts: task.maxAttempts ?? null,
          confirmPending: Boolean(task.confirmPending),
        }
      : null,
    deliveryProbe: probe
      ? {
          offerStatus: probe.offerStatus ?? null,
          outcome: probe.outcome ?? null,
          reasonCode: probe.reasonCode ?? null,
        }
      : null,
    tradeVerification: params.order.tradeVerification
      ? {
          status: params.order.tradeVerification.status,
          match: params.order.tradeVerification.match,
          failedCheckKeys: params.order.tradeVerification.failedChecks.map(
            (check) => check.key,
          ),
          nextActionKind: params.order.tradeVerification.nextAction?.kind ?? null,
        }
      : null,
    extension: {
      id: getExtensionId() ?? null,
      connected: Boolean(params.extensionStatus?.connected),
      expiresAt: params.extensionStatus?.expiresAt ?? null,
      sessionHealthCode: params.sessionHealthCode ?? null,
    },
    locale: params.locale,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  };
}

export function formatSupportDebugPack(pack: SupportDebugPack): string {
  return JSON.stringify(pack, null, 2);
}
