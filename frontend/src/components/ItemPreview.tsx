import { useLocale } from '../i18n';
import type { ItemDisplaySource } from '../utils/item-image';
import {
  formatFloatValue,
  formatPaintSeed,
  getItemCategory,
} from '../utils/item-image';
import { SteamItemImage } from './SteamItemImage';

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
  const { t } = useLocale();
  const floatText = formatFloatValue(item.floatValue);
  const patternText = formatPaintSeed(item.paintSeed);
  const category = getItemCategory(item);
  const wear = item.wear ?? null;
  const displayTitle = title ?? item.itemDefinition.marketHashName;

  return (
    <div className={`item-preview item-preview-${size}`} data-testid="item-preview">
      <SteamItemImage
        iconUrl={item.itemDefinition.iconUrl}
        alt={displayTitle}
        className="item-preview-image"
        data-testid="item-preview-image"
      />
      {title ? <h3 className="item-preview-title">{title}</h3> : null}
      {showAttrs ? (
        <dl className="item-preview-attrs meta-list">
          {category ? (
            <div>
              <dt>{t('itemPreview.category')}</dt>
              <dd data-testid="item-preview-category">{category}</dd>
            </div>
          ) : null}
          {wear ? (
            <div>
              <dt>{t('itemPreview.wear')}</dt>
              <dd data-testid="item-preview-wear">{wear}</dd>
            </div>
          ) : null}
          {floatText ? (
            <div>
              <dt>{t('itemPreview.float')}</dt>
              <dd data-testid="item-preview-float">{floatText}</dd>
            </div>
          ) : null}
          {patternText ? (
            <div>
              <dt>{t('itemPreview.pattern')}</dt>
              <dd data-testid="item-preview-pattern">{patternText}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
