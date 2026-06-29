import type { ItemDisplaySource } from '../utils/item-image';
import {
  formatFloatValue,
  formatPaintSeed,
  getItemCategory,
  getSteamItemImageUrl,
} from '../utils/item-image';

type ItemPreviewProps = {
  item: ItemDisplaySource;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  showAttrs?: boolean;
};

export function ItemPreview({
  item,
  title,
  size = 'md',
  showAttrs = true,
}: ItemPreviewProps) {
  const imageUrl = getSteamItemImageUrl(item.itemDefinition.iconUrl);
  const floatText = formatFloatValue(item.floatValue);
  const patternText = formatPaintSeed(item.paintSeed);
  const category = getItemCategory(item);
  const wear = item.wear ?? null;

  return (
    <div className={`item-preview item-preview-${size}`} data-testid="item-preview">
      <img
        src={imageUrl}
        alt={title ?? item.itemDefinition.marketHashName}
        className="item-preview-image"
        loading="lazy"
        data-testid="item-preview-image"
      />
      {title ? <h3 className="item-preview-title">{title}</h3> : null}
      {showAttrs ? (
        <dl className="item-preview-attrs meta-list">
          {category ? (
            <div>
              <dt>Категория</dt>
              <dd data-testid="item-preview-category">{category}</dd>
            </div>
          ) : null}
          {wear ? (
            <div>
              <dt>Wear</dt>
              <dd data-testid="item-preview-wear">{wear}</dd>
            </div>
          ) : null}
          {floatText ? (
            <div>
              <dt>Float</dt>
              <dd data-testid="item-preview-float">{floatText}</dd>
            </div>
          ) : null}
          {patternText ? (
            <div>
              <dt>Pattern</dt>
              <dd data-testid="item-preview-pattern">{patternText}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
