import type { CSSProperties } from 'react';
import type { ItemDisplaySource } from '../utils/item-image';
import { getSteamItemImageUrl } from '../utils/item-image';
import { getRarityStyle } from '../utils/rarity-colors';

type LotItemHeroProps = {
  item: ItemDisplaySource;
  title?: string;
};

export function LotItemHero({ item, title }: LotItemHeroProps) {
  const imageUrl = getSteamItemImageUrl(item.itemDefinition.iconUrl);
  const displayTitle = title ?? item.itemDefinition.marketHashName;
  const rarityStyle = getRarityStyle(item.itemDefinition.rarity);

  const imageWrapStyle = {
    '--lot-rarity-color': rarityStyle.color,
    '--lot-rarity-glow': rarityStyle.glow,
  } as CSSProperties;

  return (
    <div className="lot-item-hero" data-testid="lot-item-hero">
      <div className="lot-item-hero-image-wrap" style={imageWrapStyle}>
        <img
          src={imageUrl}
          alt={displayTitle}
          className="lot-item-hero-image"
          loading="lazy"
          data-testid="item-preview-image"
        />
      </div>
      <h1 className="lot-item-hero-title">{displayTitle}</h1>
    </div>
  );
}
