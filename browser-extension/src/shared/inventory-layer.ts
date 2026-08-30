/**
 * D1: view-model for the non-invasive CS2 inventory presence layer.
 * D2+ enriches item cells; this describes the host chrome + CTAs.
 */

export type InventoryLayerConnection = 'connected' | 'disconnected' | 'safe_mode';

export type InventoryLayerSecondaryCta = {
  label: string;
  href: string;
};

export type InventoryLayerView = {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  /** Optional secondary link (e.g. site inventory when primary is listings). */
  secondaryCta: InventoryLayerSecondaryCta | null;
  connection: InventoryLayerConnection;
  itemHolderCount: number;
};

export function resolveInventoryLayerView(params: {
  connected: boolean;
  sellUrl: string;
  /** Active listings on the site (`/deals?tab=listings`). */
  listingsUrl: string;
  accountUrl: string;
  itemHolderCount: number;
  /** H4: site offline/degraded — warnings only, no list. */
  siteSafeMode?: boolean;
}): InventoryLayerView {
  if (params.connected && params.siteSafeMode) {
    return {
      title: 'R.I.P Market · безопасный режим',
      body: 'API сделок недоступен или нестабилен (сайт в браузере может открываться). Кэш в popup; выставка и send отключены. Guard / Accept — только в Steam.',
      ctaLabel: 'Открыть объявления',
      ctaHref: params.listingsUrl,
      secondaryCta: {
        label: 'Инвентарь на сайте',
        href: params.sellUrl,
      },
      connection: 'safe_mode',
      itemHolderCount: params.itemHolderCount,
    };
  }

  if (params.connected) {
    return {
      title: 'R.I.P Market · CS2',
      body: 'Цены, bid, «Продать» / «Управлять». Hold / сделка / задача обмена блокируют list.',
      ctaLabel: 'Мои объявления',
      ctaHref: params.listingsUrl,
      secondaryCta: {
        label: 'Инвентарь на сайте',
        href: params.sellUrl,
      },
      connection: 'connected',
      itemHolderCount: params.itemHolderCount,
    };
  }

  return {
    title: 'R.I.P Market · CS2',
    body: 'Float и wear уже на карточках. Сайт может быть открыт — подключите расширение в Аккаунте, иначе выставить нельзя.',
    ctaLabel: 'Подключить на сайте',
    ctaHref: params.accountUrl,
    secondaryCta: null,
    connection: 'disconnected',
    itemHolderCount: params.itemHolderCount,
  };
}
