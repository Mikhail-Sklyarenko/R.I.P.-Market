import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import type { Order } from '../api/types';
import { MoneyDisplay } from './MoneyDisplay';
import { buildOrderPostTradeReceipt } from '../utils/post-trade-receipt';

type PostTradeReceiptPanelProps = {
  order: Order;
  role: 'buyer' | 'seller' | 'other';
};

export function PostTradeReceiptPanel({
  order,
  role,
}: PostTradeReceiptPanelProps) {
  const { t } = useLocale();
  const view = buildOrderPostTradeReceipt({ order, role });
  if (!view) {
    return null;
  }

  return (
    <section
      className="post-trade-receipt"
      data-testid="post-trade-receipt"
      data-role={view.role}
    >
      <p className="eyebrow">{t('postTradeReceipt.eyebrow')}</p>
      <strong
        className="post-trade-receipt-title"
        data-testid="order-completed-message"
      >
        {t(view.verbKey)} · {view.itemName}
      </strong>
      <p className="muted small">
        #{view.orderShortId} · {t('postTradeReceipt.completedHint')}
      </p>

      <ul className="post-trade-receipt-rows">
        <li>
          <span>{t('postTradeReceipt.price')}</span>
          <strong>
            <MoneyDisplay minor={view.priceMinor} />
          </strong>
        </li>
        <li>
          <span>{t('postTradeReceipt.commission')}</span>
          <strong>
            <MoneyDisplay minor={view.commissionMinor} />
          </strong>
        </li>
        <li className="post-trade-receipt-net">
          <span>{t(view.netCaptionKey)}</span>
          <strong>
            <MoneyDisplay minor={view.netMinor} />
          </strong>
        </li>
        {view.offerId ? (
          <li data-testid="post-trade-receipt-offer">
            <span>{t('postTradeReceipt.offerId')}</span>
            <strong>{view.offerId}</strong>
          </li>
        ) : null}
      </ul>

      <p className="post-trade-receipt-actions">
        <Link className="button secondary" to="/wallet">
          {t('postTradeReceipt.walletCta')}
        </Link>
        <Link className="button ghost" to="/orders">
          {t('postTradeReceipt.dealsCta')}
        </Link>
      </p>
    </section>
  );
}
