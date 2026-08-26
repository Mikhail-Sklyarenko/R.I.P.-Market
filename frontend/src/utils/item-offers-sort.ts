import type { Lot } from '../api/types';
import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

export type ItemOfferSort = 'price_asc' | 'price_desc' | 'float_asc' | 'float_desc' | 'newest';

const FLOAT_OFFER_SORTS = new Set<ItemOfferSort>(['float_asc', 'float_desc']);

export function isFloatOfferSort(sort: ItemOfferSort): boolean {
  return FLOAT_OFFER_SORTS.has(sort);
}

/** Drop float sorts when the item has no float UX (cases, keys, …). */
export function resolveItemOfferSortOptions(showFloat: boolean): ItemOfferSort[] {
  const options: ItemOfferSort[] = ['price_asc', 'price_desc', 'newest'];
  if (showFloat) {
    options.splice(2, 0, 'float_asc', 'float_desc');
  }
  return options;
}

export function clampItemOfferSort(sort: ItemOfferSort, showFloat: boolean): ItemOfferSort {
  if (!showFloat && isFloatOfferSort(sort)) {
    return 'price_asc';
  }
  return sort;
}

function parseFloatSortValue(lot: Lot): number | null {
  const raw = lot.listingSnapshot?.floatValue ?? lot.inventoryAsset.floatValue;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

export function sortItemOffers(lots: Lot[], sort: ItemOfferSort): Lot[] {
  const next = [...lots];

  next.sort((left, right) => {
    if (sort === 'price_asc') {
      return Number(left.priceMinor) - Number(right.priceMinor);
    }
    if (sort === 'price_desc') {
      return Number(right.priceMinor) - Number(left.priceMinor);
    }
    if (sort === 'newest') {
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    const leftFloat = parseFloatSortValue(left);
    const rightFloat = parseFloatSortValue(right);
    if (leftFloat === null && rightFloat === null) {
      return Number(left.priceMinor) - Number(right.priceMinor);
    }
    if (leftFloat === null) {
      return 1;
    }
    if (rightFloat === null) {
      return -1;
    }
    if (sort === 'float_asc') {
      return leftFloat - rightFloat;
    }
    return rightFloat - leftFloat;
  });

  return next;
}

export function formatOfferStickersSummary(
  stickers?: { name: string }[] | null,
  locale: Locale = 'ru',
): string {
  if (!stickers?.length) {
    return '—';
  }
  if (stickers.length === 1) {
    return stickers[0].name;
  }
  return translate(messagesByLocale[locale], 'itemOffers.stickerCount', {
    count: stickers.length,
  });
}
