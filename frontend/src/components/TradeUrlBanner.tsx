import { Link } from 'react-router-dom';
import type { AuthUser } from '../api/types';
import { hasTradeUrl } from '../utils/trade-url';

type TradeUrlBannerProps = {
  user: AuthUser | null;
};

export function TradeUrlBanner({ user }: TradeUrlBannerProps) {
  if (!user || hasTradeUrl(user.tradeUrl)) {
    return null;
  }

  return (
    <div className="trade-url-banner" data-testid="trade-url-banner" role="status">
      <p className="trade-url-banner-text">
        Укажите Trade URL в Steam — без него нельзя продавать и покупать скины.
      </p>
      <Link className="button primary sm" to="/account">
        Перейти в настройки
      </Link>
    </div>
  );
}
