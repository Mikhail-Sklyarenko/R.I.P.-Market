import type { CSSProperties, KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { InventoryAsset, InventoryPriceHint } from '../api/types';
import {
  getWearBadgeStyle,
  parseCatalogLotName,
} from '../utils/catalog-lot-display';
import { formatPaintSeed, getSteamItemImageUrl } from '../utils/item-image';
import { getRarityStyle } from '../utils/rarity-colors';
import {
  assetUnavailableReason,
  canListAsset,
  formatAssetStatus,
} from '../utils/seller-flow';
import { InventoryPriceStack } from './InventoryPriceStack';

type InventoryAssetCardProps = {
  asset: InventoryAsset;
  isSelected: boolean;
  isBulkHighlighted?: boolean;
  stackCount?: number;
  priceHint?: InventoryPriceHint | null;
  pricesLoading?: boolean;
  requireSteamPrice?: boolean;
  onSelect: (asset: InventoryAsset) => void;
};

function statusBadgeClass(status: string): string {
  if (status === 'LISTED') {
    return 'inventory-asset-card-badge inventory-asset-card-badge-listed';
  }
  if (status === 'RESERVED') {
    return 'inventory-asset-card-badge inventory-asset-card-badge-reserved';
  }
  if (status === 'SOLD') {
    return 'inventory-asset-card-badge inventory-asset-card-badge-sold';
  }
  return 'inventory-asset-card-badge';
}

export function InventoryAssetCard({
  asset,
  isSelected,
  isBulkHighlighted = false,
  stackCount = 1,
  priceHint,
  pricesLoading = false,
  requireSteamPrice = false,
  onSelect,
}: InventoryAssetCardProps) {
  const listable = canListAsset(asset);
  const name = asset.itemDefinition.marketHashName;
  const { weapon, skin } = parseCatalogLotName(name);
  const wearBadge = getWearBadgeStyle(asset.wear);
  const patternText = formatPaintSeed(asset.paintSeed);
  const imageUrl = getSteamItemImageUrl(asset.itemDefinition.iconUrl);
  const showStatusBadge = asset.status !== 'AVAILABLE';
  const rarityStyle = getRarityStyle(asset.itemDefinition.rarity);
  const unavailableReason = !listable ? assetUnavailableReason(asset) : null;
  const showStackBadge = stackCount > 1;

  const cardStyle = {
    '--lot-rarity-color': rarityStyle.color,
    '--lot-rarity-glow': rarityStyle.glow,
  } as CSSProperties;

  function handleSelect() {
    if (listable) {
      onSelect(asset);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!listable) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(asset);
    }
  }

  const cardClass = [
    'inventory-asset-card',
    listable ? 'inventory-asset-card-listable' : 'inventory-asset-card-locked',
    isSelected ? 'inventory-asset-card-selected' : '',
    isBulkHighlighted && !isSelected ? 'inventory-asset-card-bulk-highlight' : '',
    showStackBadge ? 'inventory-asset-card-stacked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const interactiveProps = listable
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'data-testid': `list-asset-${asset.id}`,
        onClick: handleSelect,
        onKeyDown: handleKeyDown,
        'aria-pressed': isSelected,
        'aria-label': showStackBadge
          ? `Выбрать ${name}, ${stackCount} шт.`
          : `Выбрать ${name}`,
      }
    : {
        'data-testid': `asset-${asset.id}`,
        title: unavailableReason ?? undefined,
      };

  return (
    <article className={cardClass} style={cardStyle} {...interactiveProps}>
      <div className="inventory-asset-card-top">
        <div className="inventory-asset-card-top-start">
          {wearBadge ? (
            <span
              className="inventory-asset-card-wear"
              style={{ color: wearBadge.color }}
              data-testid={`inventory-asset-wear-${asset.id}`}
            >
              {wearBadge.label}
            </span>
          ) : (
            <span
              className="inventory-asset-card-wear inventory-asset-card-wear-empty"
              aria-hidden="true"
            />
          )}
          {patternText ? (
            <span
              className="inventory-asset-card-pattern-tag muted small"
              data-testid={`inventory-asset-pattern-${asset.id}`}
            >
              #{patternText}
            </span>
          ) : null}
        </div>

        <div className="inventory-asset-card-top-end">
          {showStackBadge ? (
            <span
              className="inventory-asset-card-stack"
              data-testid={`inventory-asset-stack-${asset.id}`}
            >
              ×{stackCount}
            </span>
          ) : null}
          {showStatusBadge ? (
            asset.status === 'LISTED' ? (
              <Link
                className={statusBadgeClass(asset.status)}
                to="/deals?tab=listings"
                data-testid={`view-lot-${asset.id}`}
                onClick={(event) => event.stopPropagation()}
              >
                {formatAssetStatus(asset.status)}
              </Link>
            ) : (
              <span className={statusBadgeClass(asset.status)}>
                {formatAssetStatus(asset.status)}
              </span>
            )
          ) : null}
        </div>
      </div>

      <div className="inventory-asset-card-image-wrap">
        <img
          src={imageUrl}
          alt={name}
          className="inventory-asset-card-image"
          loading="lazy"
        />
      </div>

      <div className="inventory-asset-card-footer">
        <div className="inventory-asset-card-titles">
          {weapon ? <p className="inventory-asset-card-weapon">{weapon}</p> : null}
          <h3 className="inventory-asset-card-skin" title={name}>
            {skin}
          </h3>
        </div>

        <InventoryPriceStack
          steamPriceMinor={priceHint?.steamPriceMinor}
          marketplacePriceMinor={priceHint?.minMarketplacePriceMinor}
          testIdPrefix={`inventory-asset-${asset.id}`}
          loading={pricesLoading}
          requireSteamPrice={requireSteamPrice}
        />
      </div>
    </article>
  );
}
