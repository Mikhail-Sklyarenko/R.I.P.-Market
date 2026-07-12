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
  bulkListableCount?: number;
  bulkListAll?: boolean;
  onBulkListAllChange?: (value: boolean) => void;
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
  bulkListableCount = 1,
  bulkListAll = false,
  onBulkListAllChange,
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
  const showBulkOption = bulkListableCount >= 2;
  const listingCount = bulkListAll && showBulkOption ? bulkListableCount : 1;
  const totalPreview =
    preview && listingCount > 1
      ? {
          priceMinor: String(Number(preview.priceMinor) * listingCount),
          commissionMinor: String(Number(preview.commissionMinor) * listingCount),
          sellerReceiveMinor: String(Number(preview.sellerReceiveMinor) * listingCount),
        }
      : preview;

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

      <div className="inventory-sell-panel-body">
        <LotItemHero
          item={asset}
          title={asset.itemDefinition.marketHashName}
          size="sm"
        />

        {hasFloat ? <WearBar floatValue={asset.floatValue!} /> : null}

        {priceHint?.steamPriceMinor ? (
          <p
            className="inventory-sell-steam-price muted small"
            data-testid="inventory-sell-steam-price"
          >
            Цена Steam: <MoneyDisplay minor={priceHint.steamPriceMinor} strong />
          </p>
        ) : null}

        {patternText ? (
          <p
            className="inventory-sell-panel-pattern muted small"
            data-testid="inventory-sell-pattern"
          >
            Паттерн {patternText}
          </p>
        ) : null}

        <div className="inventory-sell-panel-fields">
          {recommendedMinor ? (
            <div
              className="inventory-price-recommendation"
              data-testid="inventory-price-recommendation"
            >
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

          {showBulkOption ? (
            <label className="inventory-bulk-list-option" data-testid="inventory-bulk-list-option">
              <input
                type="checkbox"
                checked={bulkListAll}
                onChange={(event) => onBulkListAllChange?.(event.target.checked)}
                data-testid="inventory-bulk-list-checkbox"
              />
              <span>
                Выставить все одинаковые ({bulkListableCount} шт.) по одной цене
              </span>
            </label>
          ) : null}

          {totalPreview ? (
            <div className="pricing-preview" data-testid="pricing-preview">
              <p className="inventory-payout-summary">
                {listingCount > 1 ? (
                  <>
                    Вы получите{' '}
                    <MoneyDisplay minor={totalPreview.sellerReceiveMinor} strong /> за{' '}
                    {listingCount} лота после комиссии 5%
                  </>
                ) : (
                  <>
                    Вы получите <MoneyDisplay minor={totalPreview.sellerReceiveMinor} strong />{' '}
                    после комиссии 5%
                  </>
                )}
              </p>
              <div className="inventory-payout-breakdown">
                <div>
                  <span>{listingCount > 1 ? 'Сумма лотов' : 'Цена лота'}</span>
                  <MoneyDisplay minor={totalPreview.priceMinor} strong />
                </div>
                <div>
                  <span>Комиссия (5%)</span>
                  <MoneyDisplay minor={totalPreview.commissionMinor} strong />
                </div>
              </div>
            </div>
          ) : null}

          <ErrorAlert error={sellError} />
        </div>
      </div>

      <div className="inventory-sell-panel-footer">
        <button
          type="submit"
          className="button primary inventory-sell-panel-submit"
          disabled={submitting || !priceMinor || !!priceError}
          data-testid="submit-listing"
        >
          {submitting
            ? 'Публикация…'
            : listingCount > 1
              ? `Выставить ${listingCount} лота`
              : 'Выставить лот'}
        </button>
      </div>
    </form>
  );
}
