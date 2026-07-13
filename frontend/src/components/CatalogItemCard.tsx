import type { CSSProperties, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CatalogItem } from '../api/types';
import { parseCatalogLotName } from '../utils/catalog-lot-display';
import { getSteamItemImageUrl } from '../utils/item-image';
import { getRarityStyle } from '../utils/rarity-colors';
import { InventoryPriceStack } from './InventoryPriceStack';

type CatalogItemCardProps = {
  item: CatalogItem;
  isLoggedIn: boolean;
  steamPriceMinor?: number | null;
  pricesLoading?: boolean;
};

export function CatalogItemCard({
  item,
  isLoggedIn,
  steamPriceMinor,
  pricesLoading = false,
}: CatalogItemCardProps) {
  const navigate = useNavigate();
  const name = item.marketHashName;
  const { weapon, skin } = parseCatalogLotName(name);
  const imageUrl = getSteamItemImageUrl(item.iconUrl);
  const itemPath = `/catalog/items/${item.id}`;
  const buyPath =
    item.featuredLotId && isLoggedIn
      ? `/lots/${item.featuredLotId}/checkout`
      : item.featuredLotId
        ? `/lots/${item.featuredLotId}`
        : null;
  const hasOffers = item.activeLotCount > 0;
  const rarityStyle = getRarityStyle(item.rarity);
  const cardStyle = {
    '--lot-rarity-color': rarityStyle.color,
    '--lot-rarity-glow': rarityStyle.glow,
  } as CSSProperties;

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
        {item.orderCount30d > 0 ? (
          <span className="catalog-lot-card-badge muted small">Популярный</span>
        ) : (
          <span className="catalog-lot-card-top-slot" aria-hidden="true" />
        )}
      </div>

      <div className="catalog-lot-card-image-wrap">
        <img src={imageUrl} alt={name} className="catalog-lot-card-image" loading="lazy" />
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
              steamPriceMinor={steamPriceMinor ?? item.steamPriceMinor}
              marketplacePriceMinor={item.minMarketplacePriceMinor}
              testIdPrefix={`catalog-item-${item.id}`}
              loading={pricesLoading && steamPriceMinor === undefined}
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
            ) : (
              <span className="catalog-lot-unlisted muted small" data-testid={`catalog-item-empty-${item.id}`}>
                Нет предложений
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
