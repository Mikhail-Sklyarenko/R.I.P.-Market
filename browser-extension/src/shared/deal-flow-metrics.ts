/**
 * Lightweight local deal-flow metrics for product QA / support debug.
 * Stored in chrome.storage.local — no network.
 */
const STORAGE_KEY = 'rip:deal-flow-metrics-v1';

export type DealFlowMetricKey =
  | 'steam_panel_views'
  | 'accept_assist_armed'
  | 'accept_assist_done'
  | 'received_ack_shown'
  | 'received_ack_clicked'
  | 'received_ack_skipped_dual_signal'
  | 'popup_confirm_primary'
  | 'order_link_clicks';

export type DealFlowMetrics = Record<DealFlowMetricKey, number> & {
  updatedAt: string | null;
};

const ZERO: DealFlowMetrics = {
  steam_panel_views: 0,
  accept_assist_armed: 0,
  accept_assist_done: 0,
  received_ack_shown: 0,
  received_ack_clicked: 0,
  received_ack_skipped_dual_signal: 0,
  popup_confirm_primary: 0,
  order_link_clicks: 0,
  updatedAt: null,
};

function asMetrics(raw: unknown): DealFlowMetrics {
  if (!raw || typeof raw !== 'object') {
    return { ...ZERO };
  }
  const entry = raw as Partial<DealFlowMetrics>;
  return {
    steam_panel_views: Number(entry.steam_panel_views) || 0,
    accept_assist_armed: Number(entry.accept_assist_armed) || 0,
    accept_assist_done: Number(entry.accept_assist_done) || 0,
    received_ack_shown: Number(entry.received_ack_shown) || 0,
    received_ack_clicked: Number(entry.received_ack_clicked) || 0,
    received_ack_skipped_dual_signal:
      Number(entry.received_ack_skipped_dual_signal) || 0,
    popup_confirm_primary: Number(entry.popup_confirm_primary) || 0,
    order_link_clicks: Number(entry.order_link_clicks) || 0,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
  };
}

export async function readDealFlowMetrics(): Promise<DealFlowMetrics> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return asMetrics(stored[STORAGE_KEY]);
  } catch {
    return { ...ZERO };
  }
}

export async function bumpDealFlowMetric(
  key: DealFlowMetricKey,
  by = 1,
): Promise<void> {
  try {
    const current = await readDealFlowMetrics();
    const next: DealFlowMetrics = {
      ...current,
      [key]: (current[key] ?? 0) + by,
      updatedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  } catch {
    // ignore quota / context invalidation
  }
}

export function formatDealFlowMetricsForDebug(metrics: DealFlowMetrics): string {
  return [
    `steam_panel_views=${metrics.steam_panel_views}`,
    `accept_assist_armed=${metrics.accept_assist_armed}`,
    `accept_assist_done=${metrics.accept_assist_done}`,
    `received_ack_shown=${metrics.received_ack_shown}`,
    `received_ack_clicked=${metrics.received_ack_clicked}`,
    `received_ack_skipped_dual_signal=${metrics.received_ack_skipped_dual_signal}`,
    `popup_confirm_primary=${metrics.popup_confirm_primary}`,
    `order_link_clicks=${metrics.order_link_clicks}`,
    `updatedAt=${metrics.updatedAt ?? '—'}`,
  ].join('\n');
}
