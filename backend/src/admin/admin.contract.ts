export const ADMIN_DISPUTE_CONTRACT = {
  reasonCodes: {
    method: 'GET',
    path: '/api/v1/admin/disputes/reason-codes',
    auth: 'admin_jwt',
    response: {
      reasons: [
        {
          code: 'string',
          category:
            'TRADE_REFERENCE|DELIVERY_VERIFICATION|EXTENSION|SETTLEMENT|TIMEOUT|ADMIN',
          reviewType: 'AUTO|MANUAL_REVIEW',
          title: 'string',
          description: 'string',
          allowedSources: [
            'SYSTEM',
            'ADMIN',
            'EXTENSION',
            'POLLER',
            'RECONCILE',
          ],
        },
      ],
    },
  },
  orderTimeline: {
    method: 'GET',
    path: '/api/v1/admin/orders/:orderId/timeline',
    auth: 'admin_jwt',
    response: {
      entries: [
        {
          id: 'string',
          at: 'iso8601',
          kind: 'ORDER_STATUS|LOT_STATUS|TRADE_OP_STATUS|AUDIT|OUTBOX|POLL|TASK|VERIFICATION',
          title: 'string',
          reasonCode: 'string|null',
          actorUserId: 'string|null',
          detail: 'object',
        },
      ],
    },
  },
  openDispute: {
    method: 'POST',
    path: '/api/v1/admin/orders/:orderId/dispute',
    auth: 'admin_jwt',
    headers: { 'Idempotency-Key': 'required' },
    body: {
      reasonCode: 'string (taxonomy, recommended)',
      reasonNote: 'string (optional)',
      reason: 'string (legacy free-text fallback)',
    },
    audit: 'ADMIN_DISPUTE_OPENED with before/after + reasonCode',
  },
  resolveDispute: {
    method: 'POST',
    path: '/api/v1/admin/orders/:orderId/resolve',
    auth: 'admin_jwt',
    headers: { 'Idempotency-Key': 'required' },
    body: {
      resolution: 'BUYER|SELLER',
      reasonCode: 'string (recommended)',
      reasonNote: 'string (optional)',
      reason: 'string (legacy)',
    },
    financialGuards: [
      'BUYER: hold not captured',
      'SELLER: hold not captured, balanced amounts',
    ],
  },
  reverseSettlementHold: {
    method: 'POST',
    path: '/api/v1/admin/orders/:orderId/reverse-settlement-hold',
    auth: 'admin_jwt',
    flags: ['ENABLE_SETTLEMENT_HOLD_WINDOW'],
    headers: { 'Idempotency-Key': 'required' },
    body: { reasonCode: 'SETTLEMENT_HOLD_REVERSED', reasonNote: 'string' },
  },
} as const;
