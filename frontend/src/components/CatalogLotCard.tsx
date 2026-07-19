import type { CSSProperties, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Lot } from '../api/types';
import {
  getWearBadgeStyle,
  parseCatalogLotName,
} from '../utils/catalog-lot-display';
import { formatPaintSeed, resolveDisplayIconUrl } from '../utils/item-image';
import { resolveLotDisplayItem } from '../utils/lot-display';
import { getRarityStyle } from '../utils/rarity-colors';
import { InventoryPriceStack } from './InventoryPriceStack';
import { SteamItemImage } from './SteamItemImage';

type CatalogLotCardProps = {
  lot: Lot;
  isLoggedIn: boolean;
};

function CatalogLotRocketIcon() {
  return (
    <svg
      className="catalog-lot-card-rocket"
      viewBox="0 0 16 16"
      width={14}
      height={14}
      aria-hidden="true"
    >
      <path
        d="M8 1.5 9.6 5.2 13.5 6.8 9.6 8.4 8 12.1 6.4 8.4 2.5 6.8 6.4 5.2 8 1.5Z"
        fill="currentColor"
      />
      <path d="M8 12.1v2.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CatalogLotHeartIcon() {
  return (
    <svg
      className="catalog-lot-card-heart"
      viewBox="0 0 16 16"
      width={14}
      height={14}
      aria-hidden="true"
    >
      <path
        d="M8 13.2s-4.8-3.1-4.8-6.4c0-1.7 1.4-3 3.1-3 1 0 1.9.5 2.5 1.2.6-.7 1.5-1.2 2.5-1.2 1.7 0 3.1 1.3 3.1 3 0 3.3-4.8 6.4-4.8 6.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CatalogLotCartIcon() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
      <path
        d="M2 2h1.2l1.4 7.2h7.4l1.6-5.2H5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="12.8" r="0.9" fill="currentColor" />
      <circle cx="11.2" cy="12.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function CatalogLotCard({ lot, isLoggedIn: _isLoggedIn }: CatalogLotCardProps) {
  const navigate = useNavigate();
  const displayItem = resolveLotDisplayItem(lot);
  const { inventoryAsset } = lot;
  const name = displayItem.itemDefinition.marketHashName;
  const { weapon, skin } = parseCatalogLotName(name);
  const wearBadge = getWearBadgeStyle(displayItem.wear ?? inventoryAsset.wear);
  const patternText = formatPaintSeed(
    displayItem.paintSeed ?? inventoryAsset.paintSeed,
  );
  const iconUrl = resolveDisplayIconUrl(
    displayItem.itemDefinition.iconUrl,
    inventoryAsset.itemDefinition.iconUrl,
  );
  const lotPath = `/lots/${lot.id}`;
  const buyPath = lotPath;
  const rarityStyle = getRarityStyle(
    displayItem.itemDefinition.rarity ?? inventoryAsset.itemDefinition.rarity,
  );
  const cardStyle = {
    '--lot-rarity-color': rarityStyle.color,
    '--lot-rarity-glow': rarityStyle.glow,
  } as CSSProperties;

  function openLot() {
    navigate(lotPath);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openLot();
    }
  }

  return (
    <article
      className="catalog-lot-card"
      style={cardStyle}
      data-testid={`catalog-lot-${lot.id}`}
      onClick={openLot}
      onKeyDown={handleCardKeyDown}
      role="link"
      tabIndex={0}
      aria-label={`Открыть лот ${name}`}
    >
      <div className="catalog-lot-card-top">
        <div className="catalog-lot-card-top-start">
          {wearBadge ? (
            <span
              className="catalog-lot-card-wear"
              style={{ color: wearBadge.color }}
              data-testid={`catalog-lot-wear-${lot.id}`}
            >
              {wearBadge.label}
            </span>
          ) : (
            <span className="catalog-lot-card-wear catalog-lot-card-wear-empty" aria-hidden="true" />
          )}
        </div>
        <div className="catalog-lot-card-top-end">
          <span className="catalog-lot-card-top-slot">
            <CatalogLotRocketIcon />
          </span>
          <span className="catalog-lot-card-top-slot catalog-lot-card-top-slot-end">
            <CatalogLotHeartIcon />
          </span>
        </div>
      </div>

      <div className="catalog-lot-card-image-wrap">
        <SteamItemImage
          iconUrl={iconUrl}
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
          {patternText ? (
            <p className="catalog-lot-card-pattern muted small" data-testid={`catalog-lot-pattern-${lot.id}`}>
              Паттерн {patternText}
            </p>
          ) : null}
        </div>

        <div className="catalog-lot-card-bottom">
          <div className="catalog-lot-card-price-row">
            <InventoryPriceStack
              steamPriceMinor={lot.steamPriceMinor}
              marketplacePriceMinor={lot.marketplacePriceMinor ?? lot.priceMinor}
              testIdPrefix={`catalog-lot-${lot.id}`}
            />
          </div>

          <div className="catalog-lot-card-actions">
            <Link
              to={buyPath}
              className="catalog-lot-buy-btn"
              data-testid={`catalog-buy-now-${lot.id}`}
              onClick={(event) => event.stopPropagation()}
            >
              Купить сейчас
            </Link>
            <Link
              to={buyPath}
              className="catalog-lot-cart-btn"
              aria-label="Купить"
              onClick={(event) => event.stopPropagation()}
            >
              <CatalogLotCartIcon />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
