import type { FormEvent } from 'react';
import type { InventoryAsset, PricingPreview } from '../api/types';
import { ErrorAlert } from './ErrorAlert';
import { ItemPreview } from './ItemPreview';
import { MoneyDisplay } from './MoneyDisplay';

type InventorySellPanelProps = {
  asset: InventoryAsset;
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

      <ItemPreview
        item={asset}
        title={asset.itemDefinition.marketHashName}
        size="sm"
      />

      <div className="inventory-sell-panel-fields">
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
