import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { AuthUser } from '../api/types';
import { useLocale } from '../i18n';
import { hasTradeUrl } from '../utils/trade-url';
import {
  UI_DISMISS_KEYS,
  UI_DISMISS_TTL,
  isUiDismissed,
  markUiDismissed,
} from '../utils/ui-dismiss';

type TradeUrlBannerProps = {
  user: AuthUser | null;
};

/**
 * Required for trading — always visible on account/sell until Trade URL is set.
 * Elsewhere: soft-dismiss for 24h so the site chrome stays calm.
 */
export function TradeUrlBanner({ user }: TradeUrlBannerProps) {
  const { t } = useLocale();
  const location = useLocation();
  const forceSurface =
    location.pathname.startsWith('/account') ||
    location.pathname.startsWith('/sell');
  const [dismissed, setDismissed] = useState(() =>
    isUiDismissed(UI_DISMISS_KEYS.tradeUrlBanner, {
      ttlMs: UI_DISMISS_TTL.day,
    }),
  );

  if (!user || hasTradeUrl(user.tradeUrl)) {
    return null;
  }
  if (dismissed && !forceSurface) {
    return null;
  }

  return (
    <div className="trade-url-banner" data-testid="trade-url-banner" role="status">
      <p className="trade-url-banner-text">{t('tradeUrlBanner.text')}</p>
      <div className="trade-url-banner-actions">
        <Link className="button primary sm" to="/account">
          {t('tradeUrlBanner.action')}
        </Link>
        {!forceSurface ? (
          <button
            type="button"
            className="button ghost sm"
            data-testid="trade-url-banner-dismiss"
            onClick={() => {
              markUiDismissed(UI_DISMISS_KEYS.tradeUrlBanner, {
                ttlMs: UI_DISMISS_TTL.day,
              });
              setDismissed(true);
            }}
          >
            {t('tradeUrlBanner.dismiss')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
