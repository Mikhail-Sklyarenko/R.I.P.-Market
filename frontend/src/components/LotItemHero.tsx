import type { CSSProperties } from 'react';
import type { ItemDisplaySource } from '../utils/item-image';
import { getRarityStyle } from '../utils/rarity-colors';
import { SteamItemImage } from './SteamItemImage';

type LotItemHeroProps = {
  item: ItemDisplaySource;
  title?: string;
  size?: 'sm' | 'md';
};

export function LotItemHero({ item, title, size = 'md' }: LotItemHeroProps) {
  const displayTitle = title ?? item.itemDefinition.marketHashName;
  const rarityStyle = getRarityStyle(item.itemDefinition.rarity);

  const imageWrapStyle = {
    '--lot-rarity-color': rarityStyle.color,
    '--lot-rarity-glow': rarityStyle.glow,
  } as CSSProperties;

  return (
    <div
      className={`lot-item-hero lot-item-hero-${size}`}
      data-testid="lot-item-hero"
    >
      <div className="lot-item-hero-image-wrap" style={imageWrapStyle}>
        <span className="lot-item-hero-rarity-glow" aria-hidden="true" />
        <span className="lot-item-hero-rarity-haze" aria-hidden="true" />
        <SteamItemImage
          iconUrl={item.itemDefinition.iconUrl}
          alt={displayTitle}
          className="lot-item-hero-image"
          data-testid="item-preview-image"
        />
      </div>
      {size === 'md' ? (
        <h1 className="lot-item-hero-title">{displayTitle}</h1>
      ) : (
        <h3 className="lot-item-hero-title lot-item-hero-title-sm">{displayTitle}</h3>
      )}
    </div>
  );
}
