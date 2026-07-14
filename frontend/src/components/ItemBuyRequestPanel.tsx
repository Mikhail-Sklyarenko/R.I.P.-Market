import { Link } from 'react-router-dom';
import type { BuyRequest, CatalogItem } from '../api/types';
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
  return (
    <div className="card lot-purchase-card item-buy-request-purchase" data-testid="item-buy-request-panel">
      <div className="lot-purchase-card-header">
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
        Сейчас этот скин никто не продаёт. Оставьте заявку — мы пришлём уведомление, когда появится
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
          <label className="form-field item-buy-request-price-field">
            <span>Максимальная цена, USD</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder={
                item.steamPriceMinor
                  ? `Например, ${(item.steamPriceMinor / 100).toFixed(2)}`
                  : 'Например, 25.00'
              }
              value={maxPriceInput}
              onChange={(event) => onMaxPriceChange(event.target.value)}
              data-testid="item-buy-request-max-price"
            />
            <span className="muted small">Необязательно — можно следить за любыми ценами</span>
          </label>

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
