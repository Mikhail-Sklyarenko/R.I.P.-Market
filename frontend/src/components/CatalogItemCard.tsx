import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { readSavedItems, toggleSavedItem, SAVED_ITEMS_EVENT } from '../utils/saved-items';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogItem } from '../api/types';
import { useLocale } from '../i18n';
import {
  getWearBadgeStyle,
  parseCatalogLotName,
  parseWearCodeFromMarketHashName,
} from '../utils/catalog-lot-display';
import { getRarityStyle } from '../utils/rarity-colors';
import { getCatalogBuyPath, getCatalogItemPath } from '../utils/catalog-navigation';
import { rememberCatalogReturnState } from '../utils/catalog-return-state';
import {
  catalogCardImageWrapClass,
  resolveCatalogCardImageProfile,
} from '../utils/catalog-card-image';
import { InventoryPriceStack } from './InventoryPriceStack';
import { SteamItemImage } from './SteamItemImage';

type CatalogItemCardProps = {
  item: CatalogItem;
  isLoggedIn: boolean;
  steamPriceMinor?: number | null;
  pricesLoading?: boolean;
};

export function CatalogItemCard({
  item,
  steamPriceMinor,
  pricesLoading = false,
}: CatalogItemCardProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const refresh = () => setSaved(readSavedItems(user?.id).some(i => i.id === item.id));
    refresh(); window.addEventListener(SAVED_ITEMS_EVENT, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(SAVED_ITEMS_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [item.id, user?.id]);
  const navigate = useNavigate();
  const name = item.marketHashName;
  const { weapon, skin } = parseCatalogLotName(name);
  // Seeded catalog cards are one-per-skin; wear is chosen on the item page.
  const wearBadge = item.catalogSeeded
    ? null
    : getWearBadgeStyle(parseWearCodeFromMarketHashName(name));
  const itemPath = getCatalogItemPath(item);
  const buyPath = getCatalogBuyPath(item);
  const hasOffers = item.activeLotCount > 0;
  const resolvedSteamPrice = steamPriceMinor ?? item.steamPriceMinor;
  const rarityStyle = getRarityStyle(item.rarity);
  const cardStyle = {
    '--lot-rarity-color': rarityStyle.color,
    '--lot-rarity-glow': rarityStyle.glow,
  } as CSSProperties;
  const imageProfile = resolveCatalogCardImageProfile({
    weapon: item.weapon,
    marketHashName: name,
  });
  const imageWrapClass = catalogCardImageWrapClass(imageProfile);

  function openItem() {
    rememberCatalogReturnState(item.id);
    navigate(itemPath);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openItem();
    }
  }

  return (
    <article
      className={`catalog-lot-card${hasOffers ? '' : ' catalog-lot-card-unlisted'}`}
      style={cardStyle}
      data-catalog-item-id={item.id}
      data-testid={hasOffers ? 'catalog-open-lot' : `catalog-item-${item.id}`}
      onClick={openItem}
      onKeyDown={handleCardKeyDown}
      role="link"
      tabIndex={0}
      aria-label={
        hasOffers
          ? t('catalogItemCard.openAria', { name })
          : t('catalogItemCard.requestAria', { name })
      }
    >
      <div className="catalog-lot-card-top">
        <div className="catalog-lot-card-top-start">
          {wearBadge ? (
            <span
              className="catalog-lot-card-wear"
              style={{ color: wearBadge.color }}
              data-testid={`catalog-item-wear-${item.id}`}
            >
              {wearBadge.label}
            </span>
          ) : (
            <span className="catalog-lot-card-wear catalog-lot-card-wear-empty" aria-hidden="true" />
          )}
        </div>
        <div className="catalog-lot-card-top-end">
          <button
            type="button"
            className="saved-item-toggle"
            aria-pressed={saved}
            aria-label={t(saved ? 'ux.savedRemove' : 'ux.savedAdd')}
            onClick={(event) => {
              event.stopPropagation();
              setSaveError(
                !toggleSavedItem(
                  {
                    id: item.id,
                    ref: item.slug?.trim() || item.id,
                    name,
                  },
                  user?.id,
                ),
              );
            }}
          >
            <span className="saved-item-toggle-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16">
                {saved ? (
                  <path
                    fill="currentColor"
                    d="M6 3.75A1.75 1.75 0 0 1 7.75 2h8.5A1.75 1.75 0 0 1 18 3.75v16.1a.75.75 0 0 1-1.2.6L12 16.5l-4.8 3.95a.75.75 0 0 1-1.2-.6V3.75Z"
                  />
                ) : (
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                    d="M7.75 3.1h8.5A1.65 1.65 0 0 1 17.9 4.75v14.35L12 15.4l-5.9 3.7V4.75A1.65 1.65 0 0 1 7.75 3.1Z"
                  />
                )}
              </svg>
            </span>
          </button>
          {item.orderCount30d > 0 ? (
            <span className="catalog-lot-card-badge muted small">
              {t('catalog.popularBadge')}
            </span>
          ) : null}
        </div>
      </div>

      <div className={imageWrapClass}>
        <SteamItemImage
          iconUrl={item.iconUrl}
          alt={name}
          className="catalog-lot-card-image"
        />
      </div>

      <div className="catalog-lot-card-footer">
        <div className="catalog-lot-card-titles">
          {weapon ? <p className="catalog-lot-card-weapon">{weapon}</p> : null}
          <h3 className="catalog-lot-card-skin" title={name}>
            {skin}
          </h3>
        </div>

        <div className="catalog-lot-card-bottom">
          <div className="catalog-lot-card-price-row">
            <InventoryPriceStack
              steamPriceMinor={resolvedSteamPrice}
              marketplacePriceMinor={item.minMarketplacePriceMinor}
              testIdPrefix={`catalog-item-${item.id}`}
              loading={pricesLoading && resolvedSteamPrice == null}
              compact={!hasOffers}
            />
          </div>

          {saveError ? <p className="small" role="alert">{t('ux.savedError')}</p> : null}
          <div className="catalog-lot-card-actions">
            {buyPath ? (
              <Link
                to={buyPath}
                className="button primary sm catalog-lot-card-action"
                data-testid={`catalog-item-buy-${item.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  rememberCatalogReturnState(item.id);
                }}
              >
                {t('lot.buyNow')}
              </Link>
            ) : (
              <Link
                to={itemPath}
                className="button secondary sm catalog-lot-card-action"
                data-testid={`catalog-item-request-${item.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  rememberCatalogReturnState(item.id);
                }}
              >
                {t('item.leaveRequest')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
