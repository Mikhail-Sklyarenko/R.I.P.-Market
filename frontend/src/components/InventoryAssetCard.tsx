import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { InventoryAsset } from '../api/types';
import {
  getWearBadgeStyle,
  parseCatalogLotName,
} from '../utils/catalog-lot-display';
import { getSteamItemImageUrl } from '../utils/item-image';
import {
  assetUnavailableReason,
  canListAsset,
  formatAssetStatus,
} from '../utils/seller-flow';

type InventoryAssetCardProps = {
  asset: InventoryAsset;
  isSelected: boolean;
  onSelect: (asset: InventoryAsset) => void;
};

export function InventoryAssetCard({
  asset,
  isSelected,
  onSelect,
}: InventoryAssetCardProps) {
  const listable = canListAsset(asset);
  const name = asset.itemDefinition.marketHashName;
  const { weapon, skin } = parseCatalogLotName(name);
  const wearBadge = getWearBadgeStyle(asset.wear);
  const imageUrl = getSteamItemImageUrl(asset.itemDefinition.iconUrl);
  const showStatus = asset.status !== 'AVAILABLE';

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
        'aria-label': `Выбрать ${name}`,
      }
    : {
        'data-testid': `asset-${asset.id}`,
      };

  return (
    <article className={cardClass} {...interactiveProps}>
      <div className="inventory-asset-card-top">
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

        {showStatus ? (
          <p className="inventory-asset-card-status">{formatAssetStatus(asset.status)}</p>
        ) : null}

        {asset.status === 'LISTED' ? (
          <Link
            className="inventory-asset-card-link"
            to="/sell/my-lots"
            data-testid={`view-lot-${asset.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            Активный лот
          </Link>
        ) : null}

        {!listable && asset.status !== 'LISTED' ? (
          <p className="inventory-asset-card-reason">{assetUnavailableReason(asset)}</p>
        ) : null}
      </div>
    </article>
  );
}
