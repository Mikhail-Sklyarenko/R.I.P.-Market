import { type FormEvent, useEffect } from 'react';
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
  steamPriceMissing?: boolean;
  priceInput: string;
  priceError: string | null;
  preview: PricingPreview | null;
  sellError: unknown;
  submitting: boolean;
  priceMinor: number | null;
  bulkListableCount?: number;
  bulkListAll?: boolean;
  stackCount?: number;
  onBulkListAllChange?: (value: boolean) => void;
  onPriceChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
};

function formatLotCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return `${count} лотов`;
  }
  if (mod10 === 1) {
    return `${count} лот`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} лота`;
  }
  return `${count} лотов`;
}

export function InventorySellPanel({
  asset,
  priceHint,
  steamPriceMissing = false,
  priceInput,
  priceError,
  preview,
  sellError,
  submitting,
  priceMinor,
  bulkListableCount = 1,
  bulkListAll = false,
  stackCount = 1,
  onBulkListAllChange,
  onPriceChange,
  onSubmit,
  onClose,
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <form
      className="card inventory-listing-modal"
      data-testid="inventory-sell-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-listing-modal-title"
      onSubmit={onSubmit}
    >
      <div className="inventory-listing-modal-header">
        <h2 id="inventory-listing-modal-title" className="inventory-listing-modal-title">
          Выставить лот
        </h2>
        <button
          type="button"
          className="inventory-listing-modal-close"
          aria-label="Закрыть"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="inventory-listing-modal-grid">
        <section className="inventory-listing-modal-preview">
          <div className="inventory-listing-modal-preview-media">
            {stackCount > 1 ? (
              <span
                className="inventory-listing-modal-stack"
                data-testid="inventory-listing-stack-count"
              >
                ×{stackCount}
              </span>
            ) : null}
            <LotItemHero
              item={asset}
              title={asset.itemDefinition.marketHashName}
              size="md"
            />
          </div>

          {hasFloat ? <WearBar floatValue={asset.floatValue!} /> : null}

          {patternText ? (
            <p
              className="inventory-sell-panel-pattern muted small"
              data-testid="inventory-sell-pattern"
            >
              Паттерн {patternText}
            </p>
          ) : null}

          {priceHint?.steamPriceMinor ? (
            <p
              className="inventory-sell-steam-price muted small"
              data-testid="inventory-sell-steam-price"
            >
              Цена Steam: <MoneyDisplay minor={priceHint.steamPriceMinor} strong />
            </p>
          ) : steamPriceMissing ? (
            <p className="field-error small" data-testid="inventory-sell-steam-price-missing">
              Цена Steam недоступна — выставление лота временно заблокировано.
            </p>
          ) : null}
        </section>

        <section className="inventory-listing-modal-action">
          {recommendedMinor ? (
            <div
              className="inventory-price-recommendation"
              data-testid="inventory-price-recommendation"
            >
              <p className="muted small">
                Рекомендуем от <strong>{formatUsdFromMinor(recommendedMinor)}</strong>
                {recommendedSource === 'market'
                  ? ' — мин. на маркете'
                  : ' — Steam −5%'}
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
              autoFocus
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
            <div className="pricing-preview inventory-sell-payout" data-testid="pricing-preview">
              <p className="inventory-payout-summary">
                {listingCount > 1 ? (
                  <>
                    Вы получите{' '}
                    <MoneyDisplay minor={totalPreview.sellerReceiveMinor} strong /> за{' '}
                    {formatLotCountLabel(listingCount)} после комиссии 5%
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
                  <span>{listingCount > 1 ? 'Сумма' : 'Цена'}</span>
                  <MoneyDisplay minor={totalPreview.priceMinor} strong />
                </div>
                <div>
                  <span>Комиссия</span>
                  <MoneyDisplay minor={totalPreview.commissionMinor} strong />
                </div>
              </div>
            </div>
          ) : null}

          <ErrorAlert error={sellError} />

          <button
            type="submit"
            className="button primary inventory-listing-modal-submit"
            disabled={submitting || !priceMinor || !!priceError || steamPriceMissing}
            data-testid="submit-listing"
          >
            {submitting
              ? 'Публикация…'
              : listingCount > 1
                ? `Выставить ${formatLotCountLabel(listingCount)}`
                : 'Выставить лот'}
          </button>
        </section>
      </div>
    </form>
  );
}
