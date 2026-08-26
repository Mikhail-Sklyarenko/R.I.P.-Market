/**
 * D4: One-click «Продать на R.I.P» from Steam CS2 inventory.
 * Pure helpers — content script mounts CTA/panel; SW posts POST /lots.
 */

import {
  calculateCommissionMinor,
  calculateSellerReceiveMinor,
  formatUsdFromMinor,
  getDefaultListPriceMinor,
  getRecommendedListPriceMinor,
  parseMinor,
  type InventoryPriceHintLike,
} from './inventory-price-intel.js';
import type { InventoryItemPlatformFacts } from './inventory-item-enrichment.js';
import {
  evaluatePrelistSafety,
  PRELIST_SOFT_GATE_MESSAGE,
} from './inventory-prelist-safety.js';

export type InventorySellActionKind =
  | 'list'
  | 'manage'
  | 'open_lot'
  | 'pair'
  | 'blocked';

export type InventorySellBlockReason =
  | 'in_deal'
  | 'active_trade_task'
  | 'trade_locked'
  | 'not_tradable'
  | 'not_marketable'
  | 'not_listable_type'
  | 'not_available'
  | 'site_offline';

export type InventorySellAction = {
  kind: InventorySellActionKind;
  label: string;
  blockReason: InventorySellBlockReason | null;
  blockMessage: string | null;
  lotUrl: string | null;
  lotId: string | null;
  listedPriceMinor: string | null;
};

export type InventorySellPreview = {
  priceMinor: number;
  commissionMinor: number;
  sellerReceiveMinor: number;
  priceLine: string;
  commissionLine: string;
  receiveLine: string;
};

export type PlatformInventoryAssetForSell = {
  id?: string;
  assetExternalId?: string;
  status?: string;
};

const MIN_LIST_PRICE_MINOR = 1;

export function resolveInventorySellAction(params: {
  connected: boolean;
  /** H4 safe mode — block list and lot mutations. */
  siteSafeMode?: boolean;
  steam: {
    tradable: boolean;
    marketable: boolean;
    tradeLockUntil: string | null;
    marketHashName?: string | null;
  };
  platform?: InventoryItemPlatformFacts | null;
  nowMs?: number;
}): InventorySellAction {
  const emptyLot = {
    lotId: null as string | null,
    listedPriceMinor: null as string | null,
  };

  if (!params.connected) {
    return {
      kind: 'pair',
      label: 'Продать на R.I.P',
      blockReason: null,
      blockMessage: PRELIST_SOFT_GATE_MESSAGE,
      lotUrl: null,
      ...emptyLot,
    };
  }

  if (params.siteSafeMode) {
    return {
      kind: 'blocked',
      label: 'Сайт offline',
      blockReason: 'site_offline',
      blockMessage:
        'Сайт недоступен или связь нестабильна — выставка и управление лотом временно отключены.',
      lotUrl: params.platform?.lotUrl ?? params.platform?.orderUrl ?? null,
      lotId: params.platform?.lotId ?? null,
      listedPriceMinor: params.platform?.listedPriceMinor ?? null,
    };
  }

  // ACTIVE listing → manage (unless reserved / in deal).
  if (
    params.platform?.listed &&
    params.platform.lotId &&
    !params.platform.inActiveDeal &&
    !params.platform.hasActiveTradeTask
  ) {
    return {
      kind: 'manage',
      label: 'Управлять',
      blockReason: null,
      blockMessage: null,
      lotUrl: params.platform.lotUrl,
      lotId: params.platform.lotId,
      listedPriceMinor: params.platform.listedPriceMinor,
    };
  }

  if (params.platform?.listed && params.platform.inActiveDeal) {
    return {
      kind: 'blocked',
      label: 'В сделке',
      blockReason: 'in_deal',
      blockMessage:
        'Лот в сделке — цену и отмену менять нельзя. Откройте заказ.',
      lotUrl: params.platform.orderUrl ?? params.platform.lotUrl,
      lotId: params.platform.lotId,
      listedPriceMinor: params.platform.listedPriceMinor,
    };
  }

  const safety = evaluatePrelistSafety({
    connected: true,
    siteSafeMode: params.siteSafeMode,
    steam: params.steam,
    platform: params.platform,
    nowMs: params.nowMs,
  });

  if (!safety.canList) {
    const blockReason =
      safety.reason === 'disconnected' || safety.reason === 'listed'
        ? null
        : (safety.reason as InventorySellBlockReason | null);
    return {
      kind: 'blocked',
      label: safety.label ?? 'Нельзя',
      blockReason,
      blockMessage: safety.message,
      lotUrl: safety.orderUrl,
      lotId: params.platform?.lotId ?? null,
      listedPriceMinor: params.platform?.listedPriceMinor ?? null,
    };
  }

  return {
    kind: 'list',
    label: 'Продать на R.I.P',
    blockReason: null,
    blockMessage: null,
    lotUrl: null,
    ...emptyLot,
  };
}

export function resolveDefaultListPriceMinor(
  hint?: InventoryPriceHintLike | null,
): number | null {
  return getDefaultListPriceMinor(hint);
}

/**
 * D5: honest “list at best bid” offer — not instant cash settlement.
 * Available only when an open buy-request bid exists.
 */
export type InventoryBidListOffer = {
  available: boolean;
  priceMinor: number | null;
  quantity: number | null;
  buttonLabel: string | null;
  hintLine: string | null;
  /** Explicit: buyer is notified; trade/payout still follow normal P2P. */
  honestyLine: string;
};

export function resolveBidListOffer(
  hint?: InventoryPriceHintLike | null,
): InventoryBidListOffer {
  const honestyLine =
    'Это выставка в стакан по bid: покупатель получит уведомление. Не моментальная выплата.';
  const priceMinor = parseMinor(hint?.bestBidMinor);
  if (priceMinor == null) {
    return {
      available: false,
      priceMinor: null,
      quantity: null,
      buttonLabel: null,
      hintLine: null,
      honestyLine,
    };
  }
  const quantity =
    hint?.bestBidQuantity != null &&
    Number.isFinite(hint.bestBidQuantity) &&
    hint.bestBidQuantity > 0
      ? Math.floor(hint.bestBidQuantity)
      : 1;
  const money = formatUsdFromMinor(priceMinor);
  return {
    available: true,
    priceMinor,
    quantity,
    buttonLabel: `По bid ${money}`,
    hintLine:
      quantity > 1
        ? `Лучший bid ${money} · ${quantity} покупателя готовы до этой цены`
        : `Лучший bid ${money} — покупатель готов купить до этой цены`,
    honestyLine,
  };
}

/** Steam−5% fallback when no bid (same as site). */
export function resolveSteamGuideListPriceMinor(
  hint?: InventoryPriceHintLike | null,
): number | null {
  return getRecommendedListPriceMinor(hint);
}

export function parseUsdInputToMinor(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/[^\d.,]/g, '');
  if (!normalized) {
    return null;
  }

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastDot > lastComma) {
      normalized = normalized.replace(/,/g, '');
    } else {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastComma >= 0) {
    normalized = normalized.replace(',', '.');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const minor = Math.round(value * 100);
  if (minor < MIN_LIST_PRICE_MINOR) {
    return null;
  }
  return minor;
}

export function formatUsdInputFromMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function buildInventorySellPreview(
  priceMinor: number,
): InventorySellPreview | null {
  if (!Number.isFinite(priceMinor) || priceMinor < MIN_LIST_PRICE_MINOR) {
    return null;
  }
  const commissionMinor = calculateCommissionMinor(priceMinor);
  const sellerReceiveMinor = calculateSellerReceiveMinor(priceMinor);
  return {
    priceMinor,
    commissionMinor,
    sellerReceiveMinor,
    priceLine: formatUsdFromMinor(priceMinor),
    commissionLine: `комиссия 5% · ${formatUsdFromMinor(commissionMinor)}`,
    receiveLine: `вам ${formatUsdFromMinor(sellerReceiveMinor)}`,
  };
}

export function findPlatformAssetIdByExternalId(
  assets: PlatformInventoryAssetForSell[],
  steamAssetId: string,
): string | null {
  const target = steamAssetId.trim();
  if (!target) {
    return null;
  }
  for (const asset of assets) {
    if (asset.assetExternalId?.trim() === target && asset.id?.trim()) {
      return asset.id.trim();
    }
  }
  return null;
}

export function siteLotUrl(siteOrigin: string, lotId: string): string {
  return `${siteOrigin.replace(/\/$/, '')}/lots/${lotId}`;
}

export function siteListingsUrl(siteOrigin: string): string {
  return `${siteOrigin.replace(/\/$/, '')}/deals?tab=listings`;
}

export function validateCreateLotPriceMinor(
  priceMinor: number | null,
): string | null {
  if (priceMinor == null) {
    return 'Введите цену больше $0.00';
  }
  if (priceMinor < MIN_LIST_PRICE_MINOR) {
    return 'Минимальная цена — $0.01';
  }
  return null;
}
