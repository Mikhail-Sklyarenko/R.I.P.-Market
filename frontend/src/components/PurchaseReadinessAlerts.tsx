import { Link } from 'react-router-dom';
import type { AuthUser } from '../api/types';
import { useLocale } from '../i18n';
import { ErrorAlert } from './ErrorAlert';
import { hasLinkedSteamId } from '../utils/steam-id';
import { hasTradeUrl } from '../utils/trade-url';
import { formatUsdtFromMinor } from '../utils/format';

type PurchaseReadinessAlertsProps = {
  user: AuthUser | null;
  requiresSteamLink: boolean;
  authenticated?: boolean;
  insufficientBalance?: boolean;
  walletDepositHref?: string;
  neededMinor?: number;
  showDepositAction?: boolean;
  showTradeHint?: boolean;
  compactTradeUrlWarning?: boolean;
};

export function PurchaseReadinessAlerts({
  user,
  requiresSteamLink,
  authenticated = Boolean(user),
  insufficientBalance = false,
  walletDepositHref,
  neededMinor,
  showDepositAction = true,
  showTradeHint = true,
  compactTradeUrlWarning = false,
}: PurchaseReadinessAlertsProps) {
  const { t } = useLocale();
  const steamLinked = hasLinkedSteamId(user?.steamId);
  const tradeUrlReady = hasTradeUrl(user?.tradeUrl);
  const steamBlocked = authenticated && requiresSteamLink && !steamLinked;
  const tradeUrlBlocked = authenticated && !steamBlocked && !tradeUrlReady;

  return (
    <div className="purchase-readiness-alerts">
      {steamBlocked ? (
        <div data-testid="purchase-steam-required">
          <ErrorAlert variant="info" title={t('readiness.steamRequiredTitle')}>
            {t('readiness.steamRequiredBody')}
          </ErrorAlert>
          <Link className="button secondary sm" to="/account">
            {t('readiness.toAccount')}
          </Link>
        </div>
      ) : null}

      {tradeUrlBlocked ? (
        <div
          className={compactTradeUrlWarning ? 'checkout-inline-warning' : 'alert alert-warning'}
          data-testid="purchase-trade-url-warning"
        >
          {compactTradeUrlWarning ? (
            <p className="muted small checkout-inline-warning-text">
              {t('readiness.tradeUrlInlinePrefix')}{' '}
              <Link to="/account">{t('readiness.tradeUrlInlineLink')}</Link>{' '}
              {t('readiness.tradeUrlInlineSuffix')}
            </p>
          ) : (
            <>
              <strong>{t('readiness.tradeUrlMissingTitle')}</strong>
              <p className="alert-body">{t('readiness.tradeUrlMissingBody')}</p>
              <Link className="button secondary sm" to="/account">
                {t('readiness.tradeUrlSetButton')}
              </Link>
            </>
          )}
        </div>
      ) : null}

      {authenticated && !steamBlocked && !tradeUrlBlocked && insufficientBalance ? (
        <div data-testid="purchase-insufficient-balance">
          <ErrorAlert variant="info" title={t('readiness.insufficientTitle')}>
            {neededMinor
              ? t('readiness.insufficientNeeded', { amount: formatUsdtFromMinor(neededMinor) })
              : t('readiness.insufficientGeneric')}
          </ErrorAlert>
          {showDepositAction && walletDepositHref ? (
            <Link
              className="button primary sm"
              to={walletDepositHref}
              data-testid="purchase-deposit-link"
            >
              {t('readiness.depositButton')}
            </Link>
          ) : null}
        </div>
      ) : null}

      {authenticated && !steamBlocked && !tradeUrlBlocked && showTradeHint ? (
        <p className="purchase-trade-hint" data-testid="purchase-trade-hint">
          {t('readiness.tradeHint')}
        </p>
      ) : null}
    </div>
  );
}

export function isPurchaseBlockedBySteam(
  user: AuthUser | null,
  requiresSteamLink: boolean,
  authenticated = Boolean(user),
): boolean {
  return authenticated && requiresSteamLink && !hasLinkedSteamId(user?.steamId);
}

export function isPurchaseBlockedByTradeUrl(
  user: AuthUser | null,
  authenticated = Boolean(user),
): boolean {
  return authenticated && !hasTradeUrl(user?.tradeUrl);
}

export function isPurchaseBlocked(
  user: AuthUser | null,
  requiresSteamLink: boolean,
  authenticated = Boolean(user),
): boolean {
  return (
    isPurchaseBlockedBySteam(user, requiresSteamLink, authenticated) ||
    isPurchaseBlockedByTradeUrl(user, authenticated)
  );
}
