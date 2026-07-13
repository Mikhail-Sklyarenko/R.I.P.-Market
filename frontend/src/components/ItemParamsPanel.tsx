import { useState } from 'react';
import type { ItemDisplaySource } from '../utils/item-image';
import {
  formatFloatValue,
  formatPaintSeed,
  getItemCategory,
} from '../utils/item-image';
import { parseWearCodeFromMarketHashName } from '../utils/catalog-lot-display';
import { getRarityDisplayLabel, getRarityStyle } from '../utils/rarity-colors';
import { getWearDisplayLabel } from '../utils/wear-filters';
import { FloatSpectrum } from './FloatSpectrum';

type ItemParamsPanelProps = {
  item: ItemDisplaySource;
  /** Show title with copy control above the params. */
  showTitle?: boolean;
  testId?: string;
};

export function ItemParamsPanel({
  item,
  showTitle = false,
  testId = 'item-params',
}: ItemParamsPanelProps) {
  const [copied, setCopied] = useState(false);
  const marketHashName = item.itemDefinition.marketHashName;
  const category = getItemCategory(item);
  const rarity = item.itemDefinition.rarity?.trim() || null;
  const rarityLabel = getRarityDisplayLabel(rarity);
  const rarityStyle = getRarityStyle(rarity);
  const wearCode =
    item.wear?.trim() ||
    parseWearCodeFromMarketHashName(marketHashName) ||
    null;
  const wearLabel = getWearDisplayLabel(wearCode);
  const floatText = formatFloatValue(item.floatValue);
  const hasFloatGraphic =
    item.floatValue !== null &&
    item.floatValue !== undefined &&
    item.floatValue !== '';
  const patternText = formatPaintSeed(item.paintSeed);

  async function copyName() {
    try {
      await navigator.clipboard.writeText(marketHashName);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="item-params" data-testid={testId}>
      {showTitle ? (
        <div className="item-params-title-row">
          <h2 className="item-params-title" title={marketHashName}>
            {marketHashName}
          </h2>
          <button
            type="button"
            className="item-params-copy"
            onClick={copyName}
            aria-label="Скопировать название предмета"
            data-testid={`${testId}-copy-name`}
          >
            {copied ? 'Скопировано' : '⎘'}
          </button>
        </div>
      ) : null}

      <dl className="item-params-table">
        {hasFloatGraphic || floatText ? (
          <div className="item-params-row">
            <dt>Float</dt>
            <dd data-testid={`${testId}-float`}>
              {hasFloatGraphic ? (
                <FloatSpectrum floatValue={item.floatValue!} variant="inline" />
              ) : (
                <span data-testid="lot-attr-float">{floatText}</span>
              )}
            </dd>
          </div>
        ) : null}

        {category ? (
          <div className="item-params-row">
            <dt>Тип</dt>
            <dd data-testid="lot-attr-category">{category}</dd>
          </div>
        ) : null}

        {rarityLabel ? (
          <div className="item-params-row">
            <dt>Редкость</dt>
            <dd data-testid="lot-attr-rarity">
              <span
                className="item-params-rarity-dot"
                style={{ backgroundColor: rarityStyle.color }}
                aria-hidden="true"
              />
              {rarityLabel}
            </dd>
          </div>
        ) : null}

        {wearLabel ? (
          <div className="item-params-row">
            <dt>Износ</dt>
            <dd data-testid="lot-attr-wear">{wearLabel}</dd>
          </div>
        ) : null}

        <div className="item-params-row">
          <dt>Паттерн</dt>
          <dd data-testid="lot-attr-pattern">{patternText ?? '—'}</dd>
        </div>
      </dl>
    </section>
  );
}
