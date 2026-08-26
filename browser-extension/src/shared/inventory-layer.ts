/**
 * D1: view-model for the non-invasive CS2 inventory presence layer.
 * D2+ will enrich item cells; this only describes the host chrome.
 */

export type InventoryLayerConnection = 'connected' | 'disconnected' | 'safe_mode';

export type InventoryLayerView = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  connection: InventoryLayerConnection;
  itemHolderCount: number;
};

export function resolveInventoryLayerView(params: {
  connected: boolean;
  sellUrl: string;
  accountUrl: string;
  itemHolderCount: number;
  /** H4: site offline/degraded — warnings only, no list. */
  siteSafeMode?: boolean;
}): InventoryLayerView {
  if (params.connected && params.siteSafeMode) {
    return {
      title: 'R.I.P Market · безопасный режим',
      body: 'Сайт недоступен или нестабилен. Кэш сделок в popup; выставка и send отключены. Guard / Accept — только в Steam.',
      ctaLabel: 'Открыть сайт',
      ctaHref: params.sellUrl,
      connection: 'safe_mode',
      itemHolderCount: params.itemHolderCount,
    };
  }

  if (params.connected) {
    return {
      title: 'R.I.P Market · CS2',
      body: 'Цены, bid, «Продать» / «Управлять». Safety: lock / сделка / задача обмена блокируют list.',
      ctaLabel: 'Мои продажи на сайте',
      ctaHref: params.sellUrl,
      connection: 'connected',
      itemHolderCount: params.itemHolderCount,
    };
  }

  return {
    title: 'R.I.P Market · CS2',
    body: 'Float и wear уже на карточках. Подключите расширение — иначе выставить нельзя (soft gate).',
    ctaLabel: 'Подключить на сайте',
    ctaHref: params.accountUrl,
    connection: 'disconnected',
    itemHolderCount: params.itemHolderCount,
  };
}
