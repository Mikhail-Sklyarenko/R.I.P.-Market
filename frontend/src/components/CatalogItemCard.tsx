import type { CSSProperties, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogItem } from '../api/types';
import {
  getWearBadgeStyle,
  parseCatalogLotName,
  parseWearCodeFromMarketHashName,
} from '../utils/catalog-lot-display';
import { getRarityStyle } from '../utils/rarity-colors';
import { getCatalogBuyPath, getCatalogItemPath } from '../utils/catalog-navigation';
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
  isLoggedIn: _isLoggedIn,
  steamPriceMinor,
  pricesLoading = false,
}: CatalogItemCardProps) {
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
    navigate(itemPath);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openItem();
    }
  }

  return (
    <article
      className={`catalog-lot-card${hasOffers ? '' : ' catalog-lot-card-unlisted'}`}
      style={cardStyle}
      data-testid={hasOffers ? 'catalog-open-lot' : `catalog-item-${item.id}`}
      onClick={openItem}
      onKeyDown={handleCardKeyDown}
      role="link"
      tabIndex={0}
      aria-label={hasOffers ? `Открыть ${name}` : `${name} — нет предложений`}
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
          {item.orderCount30d > 0 ? (
            <span className="catalog-lot-card-badge muted small">Популярный</span>
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

          <div className="catalog-lot-card-actions">
            {buyPath ? (
              <Link
                to={buyPath}
                className="catalog-lot-buy-btn"
                data-testid={`catalog-item-buy-${item.id}`}
                onClick={(event) => event.stopPropagation()}
              >
                Купить сейчас
              </Link>
            ) : !resolvedSteamPrice && !pricesLoading ? (
              <span className="catalog-lot-unlisted muted small" data-testid={`catalog-item-empty-${item.id}`}>
                Нет предложений
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
