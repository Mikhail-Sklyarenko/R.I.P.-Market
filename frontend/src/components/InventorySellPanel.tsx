import { type FormEvent, useEffect, type ReactNode } from 'react';
import type { InventoryAsset, InventoryPriceHint, PricingPreview } from '../api/types';
import { formatLotCountLabel, useLocale } from '../i18n';
import { formatUsdFromMinor } from '../utils/format';
import { formatPaintSeed } from '../utils/item-image';
import {
  getRecommendedPriceMinor,
  minorToPriceInput,
} from '../utils/inventory-pricing';
import { formatSteamPriceAge } from '../utils/steam-price-age';
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
  steamPricesLoading?: boolean;
  steamPriceFetchedAt?: string | null;
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
  steamPricesLoading = false,
  steamPriceFetchedAt = null,
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
  const recommendedInput =
    recommendedMinor != null ? minorToPriceInput(recommendedMinor) : null;
  const recommendedApplied =
    recommendedInput != null && priceInput.trim() === recommendedInput;
  const steamAge = formatSteamPriceAge(steamPriceFetchedAt, locale);
  const hasSteamPrice = Boolean(priceHint?.steamPriceMinor);
  const hasMarketPrice = Boolean(priceHint?.minMarketplacePriceMinor);
  const showPriceHints =
    hasSteamPrice ||
    hasMarketPrice ||
    steamPricesLoading ||
    steamPriceMissing ||
    (recommendedMinor != null && recommendedInput != null && !recommendedApplied);
  const hasTypedPrice = priceInput.trim().length > 0;
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
        <section
          className="inventory-listing-modal-preview"
          data-testid="inventory-listing-modal-preview"
        >
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
        </section>

        <section
          className="inventory-listing-modal-action"
          data-testid="inventory-listing-modal-action"
        >
          <div className="inventory-listing-pricing">
            <label className="inventory-listing-price-field" htmlFor="inventory-price-input">
              <span className="field-label">{t('sellPanel.price')}</span>
              <div
                className={`inventory-listing-price-control${
                  hasTypedPrice ? ' has-value' : ''
                }`}
              >
                <span className="inventory-listing-price-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id="inventory-price-input"
                  type="text"
                  inputMode="decimal"
                  value={priceInput}
                  placeholder={recommendedInput ?? t('sellPanel.pricePlaceholder')}
                  onChange={(event) => onPriceChange(event.target.value)}
                  data-testid="price-input"
                  autoFocus
                />
              </div>
            </label>

            {priceError ? (
              <p className="field-error" data-testid="inventory-price-error">
                {priceError}
              </p>
            ) : null}

            {totalPreview ? (
              <div className="inventory-listing-payout" data-testid="pricing-preview">
                <p className="inventory-listing-payout-main">
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
                <p className="inventory-listing-payout-meta muted small">
                  <span>
                    {listingCount > 1 ? t('sellPanel.sumLabel') : t('sellPanel.priceLabel')}{' '}
                    <MoneyDisplay minor={totalPreview.priceMinor} />
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t('sellPanel.commission')}{' '}
                    <MoneyDisplay minor={totalPreview.commissionMinor} />
                  </span>
                </p>
              </div>
            ) : null}

            {showPriceHints ? (
              <div
                className="inventory-listing-hints"
                data-testid="inventory-listing-price-guides"
              >
                {hasSteamPrice ? (
                  <span className="inventory-listing-hint" data-testid="inventory-sell-steam-price">
                    <span className="inventory-listing-hint-label">{t('sellPanel.steamPrice')}</span>
                    <MoneyDisplay minor={priceHint!.steamPriceMinor!} />
                    {steamAge ? (
                      <span className="inventory-listing-hint-age muted small">
                        · {steamAge}
                      </span>
                    ) : null}
                  </span>
                ) : steamPricesLoading ? (
                  <span
                    className="inventory-listing-hint muted small"
                    data-testid="inventory-sell-steam-price-loading"
                  >
                    {t('sellPanel.steamLoading')}
                  </span>
                ) : null}

                {hasMarketPrice ? (
                  <span className="inventory-listing-hint" data-testid="inventory-sell-market-price">
                    <span className="inventory-listing-hint-label">{t('sellPanel.marketFrom')}</span>
                    <MoneyDisplay minor={priceHint!.minMarketplacePriceMinor!} />
                  </span>
                ) : null}

                {recommendedMinor && recommendedInput && !recommendedApplied ? (
                  <span
                    className="inventory-listing-hint inventory-listing-hint-action"
                    data-testid="inventory-price-recommendation"
                  >
                    <span className="muted small">
                      {t('sellPanel.recommend', {
                        price: formatUsdFromMinor(recommendedMinor),
                      })}
                    </span>
                    <button
                      type="button"
                      className="button secondary sm"
                      data-testid="inventory-apply-recommended-price"
                      onClick={() => onPriceChange(recommendedInput)}
                    >
                      {t('sellPanel.apply')}
                    </button>
                  </span>
                ) : null}

                {recommendedApplied ? (
                  <span className="inventory-listing-hint-applied muted small">
                    {t('sellPanel.applied')}
                  </span>
                ) : null}
              </div>
            ) : null}

            {steamPriceMissing && !hasSteamPrice && !steamPricesLoading ? (
              <p
                className="inventory-listing-hint-note muted small"
                data-testid="inventory-sell-steam-price-missing"
              >
                {isEdit
                  ? t('sellPanel.steamMissingEdit')
                  : t('sellPanel.steamMissingCreate')}
              </p>
            ) : null}
          </div>

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

          <ErrorAlert error={sellError} />

          <button
            type="submit"
            className="button primary inventory-listing-modal-submit"
            disabled={busy || !priceMinor || !!priceError}
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
