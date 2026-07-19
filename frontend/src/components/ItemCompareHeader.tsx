import type { CatalogItem } from '../api/types';
import {
  getWearBadgeStyle,
  parseWearCodeFromMarketHashName,
} from '../utils/catalog-lot-display';
import { getRarityDisplayLabel, getRarityStyle } from '../utils/rarity-colors';
import { InventoryPriceStack } from './InventoryPriceStack';
import { SteamItemImage } from './SteamItemImage';

type ItemCompareHeaderProps = {
  item: CatalogItem;
};

export function ItemCompareHeader({ item }: ItemCompareHeaderProps) {
  const wearBadge = getWearBadgeStyle(parseWearCodeFromMarketHashName(item.marketHashName));
  const rarityLabel = getRarityDisplayLabel(item.rarity);
  const rarityStyle = getRarityStyle(item.rarity);
  const offerLabel =
    item.activeLotCount > 0
      ? `${item.activeLotCount} ${item.activeLotCount === 1 ? 'предложение' : item.activeLotCount < 5 ? 'предложения' : 'предложений'}`
      : 'Нет активных предложений';

  return (
    <section className="card item-compare-header" data-testid="item-compare-header">
      <div className="item-compare-header-main">
        <div className="item-compare-header-image-wrap">
          <SteamItemImage
            iconUrl={item.iconUrl}
            alt={item.marketHashName}
            className="item-compare-header-image"
          />
        </div>

        <div className="item-compare-header-copy">
          <p className="item-compare-header-eyebrow muted small">Сравнение предложений</p>
          <h1 className="item-compare-header-title">{item.marketHashName}</h1>

          <div className="item-compare-header-meta">
            {wearBadge ? (
              <span
                className="item-compare-header-wear"
                style={{ color: wearBadge.color }}
              >
                {wearBadge.label}
              </span>
            ) : null}
            {rarityLabel ? (
              <span className="item-compare-header-rarity">
                <span
                  className="item-params-rarity-dot"
                  style={{ backgroundColor: rarityStyle.color }}
                  aria-hidden="true"
                />
                {rarityLabel}
              </span>
            ) : null}
            <span className="item-compare-header-offers muted small">{offerLabel}</span>
          </div>
        </div>
      </div>

      <div className="item-compare-header-pricing">
        <InventoryPriceStack
          steamPriceMinor={item.steamPriceMinor}
          marketplacePriceMinor={item.minMarketplacePriceMinor}
          testIdPrefix="item-compare"
        />
      </div>
    </section>
  );
}
