import { type FormEvent, useEffect, type ReactNode } from 'react';
import type { InventoryAsset, InventoryPriceHint, PricingPreview } from '../api/types';
import { formatLotCountLabel, useLocale } from '../i18n';
import { formatUsdFromMinor } from '../utils/format';
import { formatPaintSeed } from '../utils/item-image';
import {
  getRecommendedPriceMinor,
  minorToPriceInput,
} from '../utils/inventory-pricing';
import { ErrorAlert } from './ErrorAlert';
import { LotItemHero } from './LotItemHero';
import { MoneyDisplay } from './MoneyDisplay';
import { WearBar } from './WearBar';

function injectAmount(
  template: string,
  amountNode: ReactNode,
): ReactNode[] {
  return template.split('⟦amount⟧').reduce<ReactNode[]>((nodes, part, index) => {
    if (index > 0) {
      nodes.push(amountNode);
    }
    if (part) {
      nodes.push(<span key={`txt-${index}`}>{part}</span>);
    }
    return nodes;
  }, []);
}

export type InventorySellPanelMode = 'create' | 'edit';

type InventorySellPanelProps = {
  mode?: InventorySellPanelMode;
  asset: InventoryAsset;
  priceHint?: InventoryPriceHint | null;
  steamPriceMissing?: boolean;
  priceInput: string;
  priceError: string | null;
  preview: PricingPreview | null;
  sellError: unknown;
  submitting: boolean;
  canceling?: boolean;
  priceMinor: number | null;
  bulkListableCount?: number;
  /** How many identical items to list (1..bulkListableCount). */
  bulkListCount?: number;
  stackCount?: number;
  onBulkListCountChange?: (value: number) => void;
  onPriceChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancelListing?: () => void;
  onClose: () => void;
};

export function InventorySellPanel({
  mode = 'create',
  asset,
  priceHint,
  steamPriceMissing = false,
  priceInput,
  priceError,
  preview,
  sellError,
  submitting,
  canceling = false,
  priceMinor,
  bulkListableCount = 1,
  bulkListCount = 1,
  stackCount = 1,
  onBulkListCountChange,
  onPriceChange,
  onSubmit,
  onCancelListing,
  onClose,
}: InventorySellPanelProps) {
  const { locale, t } = useLocale();
  const isEdit = mode === 'edit';
  const patternText = formatPaintSeed(asset.paintSeed);
  const recommendedMinor = getRecommendedPriceMinor(priceHint);
  const hasFloat =
    asset.floatValue !== null &&
    asset.floatValue !== undefined &&
    asset.floatValue !== '';
  const showQuantityPicker = !isEdit && bulkListableCount >= 2;
  const listingCount = showQuantityPicker
    ? Math.min(Math.max(1, bulkListCount), bulkListableCount)
    : 1;
  const totalPreview =
    preview && listingCount > 1
      ? {
          priceMinor: String(Number(preview.priceMinor) * listingCount),
          commissionMinor: String(Number(preview.commissionMinor) * listingCount),
          sellerReceiveMinor: String(Number(preview.sellerReceiveMinor) * listingCount),
        }
      : preview;
  const busy = submitting || canceling;
  const blockOnMissingSteam = !isEdit && steamPriceMissing;
  const lotsLabel = formatLotCountLabel(listingCount, locale);

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
      data-mode={mode}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-listing-modal-title"
      onSubmit={onSubmit}
    >
      <div className="inventory-listing-modal-header">
        <h2 id="inventory-listing-modal-title" className="inventory-listing-modal-title">
          {isEdit ? t('sellPanel.editTitle') : t('sellPanel.listTitle')}
        </h2>
        <button
          type="button"
          className="inventory-listing-modal-close"
          aria-label={t('sellPanel.close')}
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
              {t('sellPanel.pattern', { value: patternText })}
            </p>
          ) : null}

          {priceHint?.steamPriceMinor ? (
            <p
              className="inventory-sell-steam-price muted small"
              data-testid="inventory-sell-steam-price"
            >
              {t('sellPanel.steamPrice')}{' '}
              <MoneyDisplay minor={priceHint.steamPriceMinor} strong />
            </p>
          ) : steamPriceMissing ? (
            <p className="field-error small" data-testid="inventory-sell-steam-price-missing">
              {isEdit
                ? t('sellPanel.steamMissingEdit')
                : t('sellPanel.steamMissingCreate')}
            </p>
          ) : null}

          {priceHint?.minMarketplacePriceMinor ? (
            <p
              className="inventory-sell-market-price muted small"
              data-testid="inventory-sell-market-price"
            >
              {t('sellPanel.marketFrom')}{' '}
              <MoneyDisplay minor={priceHint.minMarketplacePriceMinor} />
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
                {t('sellPanel.recommend', {
                  price: formatUsdFromMinor(recommendedMinor),
                })}
              </p>
              <button
                type="button"
                className="button secondary sm"
                data-testid="inventory-apply-recommended-price"
                onClick={() => onPriceChange(minorToPriceInput(recommendedMinor))}
              >
                {t('sellPanel.apply')}
              </button>
            </div>
          ) : null}

          <label className="field" htmlFor="inventory-price-input">
            <span className="field-label">{t('sellPanel.price')}</span>
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

          {showQuantityPicker ? (
            <label
              className="field inventory-bulk-quantity"
              htmlFor="inventory-bulk-quantity"
              data-testid="inventory-bulk-list-option"
            >
              <span className="field-label">
                {t('sellPanel.quantity', { count: bulkListableCount })}
              </span>
              <div className="inventory-bulk-quantity-row">
                <input
                  id="inventory-bulk-quantity"
                  type="number"
                  min={1}
                  max={bulkListableCount}
                  step={1}
                  value={listingCount}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (!Number.isFinite(next)) {
                      return;
                    }
                    onBulkListCountChange?.(
                      Math.min(Math.max(1, Math.trunc(next)), bulkListableCount),
                    );
                  }}
                  data-testid="inventory-bulk-quantity-input"
                />
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="inventory-bulk-quantity-all"
                  onClick={() => onBulkListCountChange?.(bulkListableCount)}
                >
                  {t('sellPanel.all', { count: bulkListableCount })}
                </button>
              </div>
              <span className="muted small">{t('sellPanel.quantityHint')}</span>
            </label>
          ) : null}

          {totalPreview ? (
            <div className="pricing-preview inventory-sell-payout" data-testid="pricing-preview">
              <p className="inventory-payout-summary">
                {injectAmount(
                  listingCount > 1
                    ? t('sellPanel.youReceiveLots', {
                        amount: '⟦amount⟧',
                        lots: lotsLabel,
                      })
                    : t('sellPanel.youReceive', { amount: '⟦amount⟧' }),
                  <MoneyDisplay
                    key="payout-amount"
                    minor={totalPreview.sellerReceiveMinor}
                    strong
                  />,
                )}
              </p>
              <div className="inventory-payout-breakdown">
                <div>
                  <span>
                    {listingCount > 1
                      ? t('sellPanel.sumLabel')
                      : t('sellPanel.priceLabel')}
                  </span>
                  <MoneyDisplay minor={totalPreview.priceMinor} strong />
                </div>
                <div>
                  <span>{t('sellPanel.commission')}</span>
                  <MoneyDisplay minor={totalPreview.commissionMinor} strong />
                </div>
              </div>
            </div>
          ) : null}

          <ErrorAlert error={sellError} />

          <button
            type="submit"
            className="button primary inventory-listing-modal-submit"
            disabled={busy || !priceMinor || !!priceError || blockOnMissingSteam}
            data-testid="submit-listing"
          >
            {submitting
              ? isEdit
                ? t('sellPanel.saving')
                : t('sellPanel.publishing')
              : isEdit
                ? t('sellPanel.save')
                : listingCount > 1
                  ? t('sellPanel.submitLots', { lots: lotsLabel })
                  : t('sellPanel.submit')}
          </button>

          {isEdit && onCancelListing ? (
            <button
              type="button"
              className="button secondary inventory-listing-modal-cancel"
              disabled={busy}
              data-testid="cancel-listing"
              onClick={onCancelListing}
            >
              {canceling ? t('sellPanel.unlisting') : t('sellPanel.unlist')}
            </button>
          ) : null}
        </section>
      </div>
    </form>
  );
}
