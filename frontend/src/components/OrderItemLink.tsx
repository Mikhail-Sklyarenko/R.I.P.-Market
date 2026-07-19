import { Link } from 'react-router-dom';
import { SteamItemImage } from './SteamItemImage';

type OrderItemLinkProps = {
  href: string;
  name: string;
  iconUrl?: string | null;
  testId?: string;
};

/**
 * Compact item cell for deals tables: thumbnail + readable link (no underline noise).
 */
export function OrderItemLink({
  href,
  name,
  iconUrl,
  testId,
}: OrderItemLinkProps) {
  return (
    <Link
      to={href}
      className="order-item-link"
      data-testid={testId}
      title={`Открыть ${name}`}
    >
      <span className="order-item-link-thumb" aria-hidden="true">
        <SteamItemImage
          iconUrl={iconUrl}
          alt=""
          className="order-item-link-image"
        />
      </span>
      <span className="order-item-link-copy">
        <span className="order-item-link-name">{name}</span>
        <span className="order-item-link-hint">Страница предмета</span>
      </span>
    </Link>
  );
}
