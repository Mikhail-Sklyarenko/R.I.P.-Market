import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BuyRequest, CatalogItem } from '../api/types';
import { ApiError } from '../api/types';
import { useLocale, wearLabel } from '../i18n';
import { formatUsdFromMinor, parseUsdToMinor } from '../utils/format';
import {
  CATALOG_WEAR_FILTERS,
  getWearDisplayLabel,
} from '../utils/wear-filters';
import { ErrorAlert } from './ErrorAlert';
import { InventoryPriceStack } from './InventoryPriceStack';
import { MoneyDisplay } from './MoneyDisplay';

type ItemBuyRequestPanelProps = {
  item: CatalogItem;
  token: string | null;
  openBuyRequests: BuyRequest[];
  selectedWear: string;
  onWearChange: (wear: string) => void;
  steamPriceMinor: number | null;
  steamPriceLoading?: boolean;
  maxPriceInput: string;
  quantityInput: string;
  submitting: boolean;
  cancelingId: string | null;
  requestError: unknown;
  onMaxPriceChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: (requestId: string) => void;
};

function steamSuggestionInput(steamPriceMinor: number | null | undefined): string | null {
  if (!steamPriceMinor || steamPriceMinor <= 0) {
    return null;
  }
  return (steamPriceMinor / 100).toFixed(2);
}

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

/**
 * Buy-request CTA when an item has no active lots.
 * Compact purchase card: price → form → reserve preview; how-it-works behind details.
 */
export function ItemBuyRequestPanel({
  item,
  token,
  openBuyRequests,
  selectedWear,
  onWearChange,
  steamPriceMinor,
  steamPriceLoading = false,
  maxPriceInput,
  quantityInput,
  submitting,
  cancelingId,
  requestError,
  onMaxPriceChange,
  onQuantityChange,
  onSubmit,
  onCancel,
}: ItemBuyRequestPanelProps) {
  const { locale, t } = useLocale();
  const steamSuggestion = steamSuggestionInput(steamPriceMinor);
  const hasTypedPrice = maxPriceInput.trim().length > 0;
  const quantity = parsePositiveInt(quantityInput) ?? 1;
  const wearOptions = (item.availableWears?.length
    ? CATALOG_WEAR_FILTERS.filter((option) =>
        item.availableWears!.includes(option.value),
      )
    : []
  );
  const requiresWear = Boolean(item.catalogSeeded && wearOptions.length > 0);
  const canSubmit = Boolean(token) && (!requiresWear || Boolean(selectedWear)) && hasTypedPrice;

  const maxPriceMinor = useMemo(() => parseUsdToMinor(maxPriceInput), [maxPriceInput]);
  const reservePreviewMinor =
    maxPriceMinor != null && maxPriceMinor > 0 ? maxPriceMinor * quantity : null;

  const insufficientBalance =
    requestError instanceof ApiError && requestError.code === 'INSUFFICIENT_BALANCE';
  const activeRequestIds = useMemo(
    () => openBuyRequests.map((request) => request.id).join('-'),
    [openBuyRequests],
  );
  const [activeListExpanded, setActiveListExpanded] = useState(
    () => openBuyRequests.length <= 1,
  );

  useEffect(() => {
    setActiveListExpanded(openBuyRequests.length <= 1);
  }, [activeRequestIds, openBuyRequests.length]);

  return (
    <div
      className="lot-preview-card lot-purchase-card item-buy-request-purchase"
      data-testid="item-buy-request-panel"
    >
      <div className="item-buy-request-header">
        <p className="item-buy-request-kicker">{t('buyRequestPanel.kicker')}</p>
        <span className="badge badge-inactive" data-testid="item-buy-request-status">
          {t('item.noLots')}
        </span>
      </div>

      <div className="item-buy-request-body">
        <div className="lot-purchase-price" data-testid="item-market-price">
          <InventoryPriceStack
            steamPriceMinor={steamPriceMinor}
            marketplacePriceMinor={null}
            testIdPrefix="item"
            loading={steamPriceLoading}
            compact
          />
        </div>

        <details
          className="item-buy-request-how lot-pricing-details"
          data-testid="item-buy-request-how"
        >
          <summary className="lot-pricing-details-summary item-buy-request-how-summary">
            {t('buyRequestPanel.howItWorks')}
          </summary>
          <p className="item-buy-request-lead muted small lot-pricing-details-body">
            {t('buyRequestPanel.lead')}
          </p>
        </details>

        {openBuyRequests.length > 0 ? (
          <details
            className="item-buy-request-active-details lot-pricing-details"
            data-testid="item-buy-request-active-details"
            open={activeListExpanded}
            onToggle={(event) => setActiveListExpanded(event.currentTarget.open)}
          >
            <summary className="lot-pricing-details-summary item-buy-request-active-summary">
              {t('buyRequestPanel.activeListSummary', { count: openBuyRequests.length })}
            </summary>
            <div
              className="item-buy-request-active-list lot-pricing-details-body"
              data-testid="item-buy-request-active-list"
            >
              {openBuyRequests.map((request) => (
                <div
                  key={request.id}
                  className="item-buy-request-active"
                  data-testid={`item-buy-request-active-${request.id}`}
                >
                  <p className="item-buy-request-active-price">
                    {request.maxPriceMinor ? (
                      <>
                        {t('buyRequestPanel.upTo')}{' '}
                        <MoneyDisplay minor={request.maxPriceMinor} strong />
                      </>
                    ) : (
                      t('item.noPriceLimit')
                    )}
                    {request.quantity > 1 ? (
                      <span className="muted small">
                        {' '}
                        · {t('buyRequestPanel.quantityShort', {
                          filled: request.quantityFilled,
                          total: request.quantity,
                        })}
                      </span>
                    ) : null}
                    {request.reservedAmountMinor ? (
                      <span className="muted small">
                        {' '}
                        · {t('buyRequestPanel.reserved')}{' '}
                        <MoneyDisplay minor={request.reservedAmountMinor} />
                      </span>
                    ) : null}
                    {request.itemDefinition?.marketHashName ? (
                      <span className="muted small item-buy-request-active-wear">
                        {' '}
                        · {request.itemDefinition.marketHashName}
                      </span>
                    ) : selectedWear ? (
                      <span className="muted small item-buy-request-active-wear">
                        {' '}
                        · {getWearDisplayLabel(selectedWear, locale)}
                      </span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    className="button secondary sm"
                    disabled={submitting || cancelingId === request.id}
                    data-testid={`item-buy-request-cancel-${request.id}`}
                    onClick={() => onCancel(request.id)}
                  >
                    {cancelingId === request.id
                      ? t('buyRequestPanel.canceling')
                      : t('buyRequestPanel.cancel')}
                  </button>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        {requiresWear ? (
          <fieldset className="item-buy-request-wear" data-testid="item-buy-request-wear">
            <legend className="field-label">{t('buyRequestPanel.stateLabel')}</legend>
            <div className="item-buy-request-wear-options">
              {wearOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`catalog-rarity-filter${
                    selectedWear === option.value ? ' active' : ''
                  }`}
                  style={{ color: option.color }}
                  data-testid={`item-buy-request-wear-${option.value.toLowerCase()}`}
                  onClick={() => onWearChange(option.value)}
                >
                  {wearLabel(option.value, locale)}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="item-buy-request-price-block">
          <label className="field item-buy-request-price-field" htmlFor="item-buy-request-max-price">
            <span className="field-label">{t('buyRequestPanel.maxPriceLabel')}</span>
            <div className="item-buy-request-price-row">
              <div
                className={`item-buy-request-price-control${
                  hasTypedPrice ? ' has-value' : ''
                }`}
              >
                <span className="item-buy-request-price-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id="item-buy-request-max-price"
                  type="text"
                  inputMode="decimal"
                  placeholder={steamSuggestion ?? '0.00'}
                  value={maxPriceInput}
                  onChange={(event) => onMaxPriceChange(event.target.value)}
                  data-testid="item-buy-request-max-price"
                  autoComplete="off"
                  required
                />
              </div>
              {steamSuggestion ? (
                <button
                  type="button"
                  className="button secondary sm item-buy-request-apply-steam"
                  data-testid="item-buy-request-apply-steam"
                  onClick={() => onMaxPriceChange(steamSuggestion)}
                >
                  {t('sellPanel.apply')}
                </button>
              ) : null}
            </div>
          </label>

          <label className="field item-buy-request-quantity-field" htmlFor="item-buy-request-quantity">
            <span className="field-label">{t('buyRequestPanel.quantityLabel')}</span>
            <input
              id="item-buy-request-quantity"
              type="number"
              min={1}
              max={99}
              value={quantityInput}
              onChange={(event) => onQuantityChange(event.target.value)}
              data-testid="item-buy-request-quantity"
            />
          </label>

          {reservePreviewMinor != null && reservePreviewMinor > 0 ? (
            <p
              className="muted small item-buy-request-reserve-preview"
              data-testid="item-buy-request-reserve-preview"
            >
              {t('buyRequestPanel.reservePreview')}{' '}
              <strong>{formatUsdFromMinor(reservePreviewMinor)}</strong>
            </p>
          ) : null}
        </div>

        <ErrorAlert error={requestError} />
        {insufficientBalance ? (
          <p className="item-buy-request-wallet-link">
            <Link
              to={`/wallet?tab=deposit&returnUrl=${encodeURIComponent(window.location.pathname)}&needed=${reservePreviewMinor ?? ''}`}
              data-testid="item-buy-request-deposit-link"
            >
              {t('buyRequestPanel.depositLink')}
            </Link>
          </p>
        ) : null}

        <button
          type="button"
          className="button primary lot-purchase-button"
          disabled={submitting || !canSubmit}
          data-testid="item-buy-request-submit"
          onClick={onSubmit}
        >
          {token ? t('item.leaveRequest') : `${t('nav.login')} · ${t('item.leaveRequest')}`}
        </button>

        <p className="muted small item-buy-request-footer">
          {t('buyRequestPanel.footerPrefix')}{' '}
          <Link to="/deals?tab=requests">{t('buyRequestPanel.footerLink')}</Link>.
        </p>
      </div>
    </div>
  );
}
