import type { FormEvent } from 'react';
import type { InventoryAsset, InventoryPriceHint, PricingPreview } from '../api/types';
import { formatUsdFromMinor } from '../utils/format';
import { formatPaintSeed } from '../utils/item-image';
import {
  getRecommendedPriceMinor,
  getRecommendedPriceSource,
  minorToPriceInput,
} from '../utils/inventory-pricing';
import { ErrorAlert } from './ErrorAlert';
import { LotItemHero } from './LotItemHero';
import { MoneyDisplay } from './MoneyDisplay';
import { WearBar } from './WearBar';

type InventorySellPanelProps = {
  asset: InventoryAsset;
  priceHint?: InventoryPriceHint | null;
  priceInput: string;
  priceError: string | null;
  preview: PricingPreview | null;
  sellError: unknown;
  submitting: boolean;
  priceMinor: number | null;
  onPriceChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose?: () => void;
  showClose?: boolean;
};

export function InventorySellPanel({
  asset,
  priceHint,
  priceInput,
  priceError,
  preview,
  sellError,
  submitting,
  priceMinor,
  onPriceChange,
  onSubmit,
  onClose,
  showClose = false,
}: InventorySellPanelProps) {
  const patternText = formatPaintSeed(asset.paintSeed);
  const recommendedMinor = getRecommendedPriceMinor(priceHint);
  const recommendedSource = getRecommendedPriceSource(priceHint);
  const hasFloat =
    asset.floatValue !== null &&
    asset.floatValue !== undefined &&
    asset.floatValue !== '';

  return (
    <form
      className="card inventory-sell-panel"
      data-testid="inventory-sell-panel"
      onSubmit={onSubmit}
    >
      {showClose ? (
        <div className="inventory-sell-panel-header">
          <h2 className="inventory-sell-panel-title">Выставить лот</h2>
          <button
            type="button"
            className="inventory-sell-panel-close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      ) : (
        <h2 className="inventory-sell-panel-title">Выставить лот</h2>
      )}

      <LotItemHero
        item={asset}
        title={asset.itemDefinition.marketHashName}
        size="sm"
      />

      {hasFloat ? <WearBar floatValue={asset.floatValue!} /> : null}

      {patternText ? (
        <p className="inventory-sell-panel-pattern muted small" data-testid="inventory-sell-pattern">
          Паттерн {patternText}
        </p>
      ) : null}

      <div className="inventory-sell-panel-fields">
        {recommendedMinor ? (
          <div className="inventory-price-recommendation" data-testid="inventory-price-recommendation">
            <p className="muted small">
              Рекомендуем от{' '}
              <strong>{formatUsdFromMinor(recommendedMinor)}</strong>
              {recommendedSource === 'market'
                ? ' — минимальная цена на маркете'
                : ' — ориентир Steam −5%'}
            </p>
            <button
              type="button"
              className="button secondary sm"
              data-testid="inventory-apply-recommended-price"
              onClick={() => onPriceChange(minorToPriceInput(recommendedMinor))}
            >
              Подставить
            </button>
          </div>
        ) : null}

        <label className="field" htmlFor="inventory-price-input">
          <span className="field-label">Цена ($)</span>
          <input
            id="inventory-price-input"
            type="text"
            inputMode="decimal"
            value={priceInput}
            onChange={(event) => onPriceChange(event.target.value)}
            data-testid="price-input"
          />
        </label>

        {priceError ? <p className="field-error">{priceError}</p> : null}

        {preview ? (
          <div className="pricing-preview" data-testid="pricing-preview">
            <p className="inventory-payout-summary">
              Вы получите <MoneyDisplay minor={preview.sellerReceiveMinor} strong /> после комиссии
              5%
            </p>
            <div className="inventory-payout-breakdown">
              <div>
                <span>Цена лота</span>
                <MoneyDisplay minor={preview.priceMinor} strong />
              </div>
              <div>
                <span>Комиссия (5%)</span>
                <MoneyDisplay minor={preview.commissionMinor} strong />
              </div>
            </div>
          </div>
        ) : null}

        <ErrorAlert error={sellError} />

        <button
          type="submit"
          className="button primary"
          disabled={submitting || !priceMinor || !!priceError}
          data-testid="submit-listing"
        >
          {submitting ? 'Публикация…' : 'Выставить лот'}
        </button>
      </div>
    </form>
  );
}
