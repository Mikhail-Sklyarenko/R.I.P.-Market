import { useState } from 'react';
import { useLocale } from '../i18n';
import type { ItemDisplaySource } from '../utils/item-image';
import { formatFloatValue, getItemCategory } from '../utils/item-image';
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
  const { locale, t } = useLocale();
  const marketHashName = item.itemDefinition.marketHashName;
  const category = getItemCategory(item);
  const rarity = item.itemDefinition.rarity?.trim() || null;
  const rarityText = getRarityDisplayLabel(rarity, locale);
  const rarityStyle = getRarityStyle(rarity);
  const wearCode =
    item.wear?.trim() ||
    parseWearCodeFromMarketHashName(marketHashName) ||
    null;
  const wearText = getWearDisplayLabel(wearCode, locale);
  const floatText = formatFloatValue(item.floatValue);
  const hasFloatGraphic =
    item.floatValue !== null &&
    item.floatValue !== undefined &&
    item.floatValue !== '';
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
            aria-label={t('item.copyName')}
            data-testid={`${testId}-copy-name`}
          >
            {copied ? t('item.copied') : '⎘'}
          </button>
        </div>
      ) : null}

      <dl className="item-params-table">
        <div className="item-params-row">
          <dt>{t('item.float')}</dt>
          <dd data-testid={`${testId}-float`}>
            {hasFloatGraphic ? (
              <FloatSpectrum floatValue={item.floatValue!} variant="inline" />
            ) : (
              <span data-testid="lot-attr-float">{floatText ?? '—'}</span>
            )}
          </dd>
        </div>

        {category ? (
          <div className="item-params-row">
            <dt>{t('item.type')}</dt>
            <dd data-testid="lot-attr-category">{category}</dd>
          </div>
        ) : null}

        {rarityText ? (
          <div className="item-params-row">
            <dt>{t('item.rarity')}</dt>
            <dd data-testid="lot-attr-rarity">
              <span
                className="item-params-rarity-dot"
                style={{ backgroundColor: rarityStyle.color }}
                aria-hidden="true"
              />
              {rarityText}
            </dd>
          </div>
        ) : null}

        {wearText ? (
          <div className="item-params-row">
            <dt>{t('item.wear')}</dt>
            <dd data-testid="lot-attr-wear">{wearText}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
