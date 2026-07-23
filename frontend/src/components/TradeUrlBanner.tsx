import { Link } from 'react-router-dom';
import type { AuthUser } from '../api/types';
import { useLocale } from '../i18n';
import { hasTradeUrl } from '../utils/trade-url';

type TradeUrlBannerProps = {
  user: AuthUser | null;
};

export function TradeUrlBanner({ user }: TradeUrlBannerProps) {
  const { t } = useLocale();
  if (!user || hasTradeUrl(user.tradeUrl)) {
    return null;
  }

  return (
    <div className="trade-url-banner" data-testid="trade-url-banner" role="status">
      <p className="trade-url-banner-text">{t('tradeUrlBanner.text')}</p>
      <Link className="button primary sm" to="/account">
        {t('tradeUrlBanner.action')}
      </Link>
    </div>
  );
}
