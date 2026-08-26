/**
 * D7: Manage ACTIVE listing from Steam inventory — change price / cancel.
 * RESERVED (in deal) cannot edit price or cancel via seller APIs.
 */

import type { InventoryItemPlatformFacts } from './inventory-item-enrichment.js';
import {
  buildInventorySellPreview,
  formatUsdInputFromMinor,
  parseUsdInputToMinor,
  validateCreateLotPriceMinor,
} from './inventory-one-click-sell.js';
import { formatUsdFromMinor, parseMinor } from './inventory-price-intel.js';

export type ManageListingActionKind =
  | 'manage'
  | 'in_deal'
  | 'missing_lot'
  | 'none';

export type ManageListingAction = {
  kind: ManageListingActionKind;
  label: string;
  lotId: string | null;
  lotUrl: string | null;
  orderUrl: string | null;
  listedPriceMinor: number | null;
  message: string | null;
};

export function resolveManageListingAction(params: {
  connected: boolean;
  platform?: InventoryItemPlatformFacts | null;
}): ManageListingAction {
  if (!params.connected || !params.platform?.listed) {
    return {
      kind: 'none',
      label: '',
      lotId: null,
      lotUrl: null,
      orderUrl: null,
      listedPriceMinor: null,
      message: null,
    };
  }

  if (params.platform.inActiveDeal) {
    return {
      kind: 'in_deal',
      label: 'В сделке',
      lotId: params.platform.lotId,
      lotUrl: params.platform.lotUrl,
      orderUrl: params.platform.orderUrl,
      listedPriceMinor: parseMinor(params.platform.listedPriceMinor),
      message:
        'Лот уже в сделке — цену менять и отменять нельзя. Откройте заказ.',
    };
  }

  if (!params.platform.lotId) {
    return {
      kind: 'missing_lot',
      label: 'На R.I.P',
      lotId: null,
      lotUrl: params.platform.lotUrl,
      orderUrl: null,
      listedPriceMinor: parseMinor(params.platform.listedPriceMinor),
      message: 'Лот не найден. Откройте продажи на сайте.',
    };
  }

  return {
    kind: 'manage',
    label: 'Управлять',
    lotId: params.platform.lotId,
    lotUrl: params.platform.lotUrl,
    orderUrl: null,
    listedPriceMinor: parseMinor(params.platform.listedPriceMinor),
    message: null,
  };
}

export function formatListedPriceInput(
  listedPriceMinor: number | null,
): string {
  if (listedPriceMinor == null) {
    return '';
  }
  return formatUsdInputFromMinor(listedPriceMinor);
}

export function buildManagePricePreview(priceInput: string) {
  const priceMinor = parseUsdInputToMinor(priceInput);
  const error = validateCreateLotPriceMinor(priceMinor);
  if (error || priceMinor == null) {
    return { priceMinor: null, preview: null, error: error ?? 'Введите цену' };
  }
  return {
    priceMinor,
    preview: buildInventorySellPreview(priceMinor),
    error: null,
  };
}

export function hasPriceChanged(
  currentMinor: number | null,
  nextMinor: number | null,
): boolean {
  if (currentMinor == null || nextMinor == null) {
    return false;
  }
  return currentMinor !== nextMinor;
}

export function formatManageCurrentPriceLine(
  listedPriceMinor: number | null,
): string {
  if (listedPriceMinor == null) {
    return 'Текущая цена неизвестна';
  }
  return `Сейчас ${formatUsdFromMinor(listedPriceMinor)}`;
}
