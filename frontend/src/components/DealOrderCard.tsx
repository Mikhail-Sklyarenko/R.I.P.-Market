import { type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Order } from '../api/types';
import { useLocale } from '../i18n';
import { CopyableDealId } from './CopyableDealId';
import { MoneyDisplay } from './MoneyDisplay';
import { OrderItemLink } from './OrderItemLink';
import { StatusBadge } from './StatusBadge';
import { resolveDisplayIconUrl } from '../utils/item-image';
import {
  formatOrderRoleLabel,
  getOrderRole,
} from '../utils/my-orders';
import {
  formatOrderStatusCompact,
  getOrderNextAction,
} from '../utils/order-flow';

type DealOrderCardProps = {
  order: Order;
  userId: string | undefined;
  showRole: boolean;
};

export function DealOrderCard({ order, userId, showRole }: DealOrderCardProps) {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const role = getOrderRole(order, userId);
  const itemName = order.lot.inventoryAsset.itemDefinition.marketHashName;
  const orderHref = `/orders/${order.id}`;
  const nextAction = getOrderNextAction(order, role, locale);
  const amountMinor =
    role === 'seller' ? order.lot.sellerReceiveMinor : order.amountMinor;

  function openOrder(event?: MouseEvent) {
    if (
      event &&
      (event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey)
    ) {
      return;
    }
    const target = event?.target as HTMLElement | undefined;
    if (target?.closest('a, button')) {
      return;
    }
    navigate(orderHref);
  }

  return (
    <article
      className="deal-order-card"
      data-testid={`order-row-${order.status}`}
      tabIndex={0}
      onClick={openOrder}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(orderHref);
        }
      }}
    >
      <div className="deal-order-card-main">
        <OrderItemLink
          href={orderHref}
          name={itemName}
          iconUrl={resolveDisplayIconUrl(
            order.lot.listingSnapshot?.iconUrl,
            order.lot.inventoryAsset.itemDefinition.iconUrl,
          )}
          compact
          testId={`open-order-${order.id}`}
        />
        {nextAction ? (
          <p className="deal-order-card-next muted small" data-testid={`order-next-${order.id}`}>
            <span className="deal-order-card-next-label">{t('orders.nextStep')}</span>
            {nextAction.title}
          </p>
        ) : null}
      </div>

      <div className="deal-order-card-meta">
        {showRole ? (
          <span className="deals-role-label">{formatOrderRoleLabel(role, locale)}</span>
        ) : null}
        <StatusBadge
          status={order.status}
          label={formatOrderStatusCompact(order.status, locale)}
          compact
        />
        <span className="sr-only">{order.status}</span>
        <MoneyDisplay minor={amountMinor} strong />
        <time className="deal-order-card-date muted small" dateTime={order.createdAt}>
          {new Date(order.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
        <CopyableDealId id={order.id} compact testId={`order-deal-id-${order.id}`} />
      </div>
    </article>
  );
}
