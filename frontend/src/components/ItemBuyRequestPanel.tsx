import { Link } from 'react-router-dom';
import type { BuyRequest, CatalogItem } from '../api/types';
import { formatUsdFromMinor } from '../utils/format';
import { ErrorAlert } from './ErrorAlert';
import { InventoryPriceStack } from './InventoryPriceStack';
import { MoneyDisplay } from './MoneyDisplay';

type ItemBuyRequestPanelProps = {
  item: CatalogItem;
  token: string | null;
  openBuyRequest: BuyRequest | null;
  maxPriceInput: string;
  submitting: boolean;
  requestError: unknown;
  onMaxPriceChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

function steamSuggestionInput(steamPriceMinor: number | null | undefined): string | null {
  if (!steamPriceMinor || steamPriceMinor <= 0) {
    return null;
  }
  return (steamPriceMinor / 100).toFixed(2);
}

/**
 * Buy-request CTA when an item has no active lots.
 * Price control mirrors the inventory listing field language.
 */
export function ItemBuyRequestPanel({
  item,
  token,
  openBuyRequest,
  maxPriceInput,
  submitting,
  requestError,
  onMaxPriceChange,
  onSubmit,
  onCancel,
}: ItemBuyRequestPanelProps) {
  const steamSuggestion = steamSuggestionInput(item.steamPriceMinor);
  const hasTypedPrice = maxPriceInput.trim().length > 0;

  return (
    <div
      className="card lot-purchase-card item-buy-request-purchase"
      data-testid="item-buy-request-panel"
    >
      <div className="lot-purchase-card-header item-buy-request-header">
        <p className="item-buy-request-kicker">Заявка на покупку</p>
        <span className="badge badge-inactive" data-testid="item-buy-request-status">
          Нет лотов
        </span>
      </div>

      <div className="lot-purchase-price" data-testid="item-market-price">
        <InventoryPriceStack
          steamPriceMinor={item.steamPriceMinor}
          marketplacePriceMinor={null}
          testIdPrefix="item"
        />
      </div>

      <p className="item-buy-request-lead muted small">
        Сейчас этот скин никто не продаёт. Оставьте заявку — пришлём уведомление, когда появится
        подходящее предложение.
      </p>

      {openBuyRequest ? (
        <div className="item-buy-request-active" data-testid="item-buy-request-active">
          <p className="item-buy-request-active-title">Заявка активна</p>
          <p className="item-buy-request-active-price">
            {openBuyRequest.maxPriceMinor ? (
              <>
                До <MoneyDisplay minor={openBuyRequest.maxPriceMinor} strong />
              </>
            ) : (
              'Без ограничения цены'
            )}
          </p>
          <button
            type="button"
            className="button secondary lot-purchase-button"
            disabled={submitting}
            data-testid="item-buy-request-cancel"
            onClick={onCancel}
          >
            Отменить заявку
          </button>
        </div>
      ) : (
        <>
          <div className="item-buy-request-price-block">
            {steamSuggestion ? (
              <div
                className="inventory-price-recommendation item-buy-request-suggestion"
                data-testid="item-buy-request-suggestion"
              >
                <p className="muted small">
                  Ориентир Steam:{' '}
                  <strong>{formatUsdFromMinor(item.steamPriceMinor!)}</strong>
                </p>
                <button
                  type="button"
                  className="button secondary sm"
                  data-testid="item-buy-request-apply-steam"
                  onClick={() => onMaxPriceChange(steamSuggestion)}
                >
                  Подставить
                </button>
              </div>
            ) : null}

            <label className="field item-buy-request-price-field" htmlFor="item-buy-request-max-price">
              <span className="field-label">Максимальная цена</span>
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
                />
              </div>
              <span className="muted small item-buy-request-price-hint">
                Необязательно — можно следить за любыми предложениями
              </span>
            </label>
          </div>

          <ErrorAlert error={requestError} />

          <button
            type="button"
            className="button primary lot-purchase-button"
            disabled={submitting}
            data-testid="item-buy-request-submit"
            onClick={onSubmit}
          >
            {token ? 'Оставить заявку' : 'Войти и оставить заявку'}
          </button>
        </>
      )}

      <p className="muted small item-buy-request-footer">
        Активные заявки — во вкладке{' '}
        <Link to="/deals?tab=requests">Сделки → Заявки</Link>.
      </p>
    </div>
  );
}
