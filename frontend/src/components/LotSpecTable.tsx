import type { ItemDisplaySource } from '../utils/item-image';
import {
  formatFloatValue,
  formatPaintSeed,
  getItemCategory,
} from '../utils/item-image';
import { getRarityDisplayLabel, getRarityStyle } from '../utils/rarity-colors';
import { getWearDisplayLabel } from '../utils/wear-filters';

type LotSpecTableProps = {
  item: ItemDisplaySource;
};

export function LotSpecTable({ item }: LotSpecTableProps) {
  const category = getItemCategory(item);
  const rarity = item.itemDefinition.rarity?.trim() || null;
  const rarityLabel = getRarityDisplayLabel(rarity);
  const rarityStyle = getRarityStyle(rarity);
  const wearLabel = getWearDisplayLabel(item.wear);
  const floatText = formatFloatValue(item.floatValue);
  const patternText = formatPaintSeed(item.paintSeed);

  return (
    <dl className="lot-spec-table" data-testid="lot-spec-table">
      {category ? (
        <div className="lot-spec-row">
          <dt>Тип</dt>
          <dd data-testid="lot-attr-category">{category}</dd>
        </div>
      ) : null}
      {rarityLabel ? (
        <div className="lot-spec-row">
          <dt>Редкость</dt>
          <dd data-testid="lot-attr-rarity">
            <span
              className="lot-spec-rarity-dot"
              style={{ backgroundColor: rarityStyle.color }}
              aria-hidden="true"
            />
            {rarityLabel}
          </dd>
        </div>
      ) : null}
      {wearLabel ? (
        <div className="lot-spec-row">
          <dt>Износ</dt>
          <dd data-testid="lot-attr-wear">{wearLabel}</dd>
        </div>
      ) : null}
      {floatText ? (
        <div className="lot-spec-row">
          <dt>Флоат</dt>
          <dd data-testid="lot-attr-float">{floatText}</dd>
        </div>
      ) : null}
      <div className="lot-spec-row">
        <dt>Паттерн</dt>
        <dd data-testid="lot-attr-pattern">{patternText ?? '—'}</dd>
      </div>
    </dl>
  );
}
