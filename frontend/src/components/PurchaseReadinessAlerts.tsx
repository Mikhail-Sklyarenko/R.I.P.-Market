import { Link } from 'react-router-dom';
import type { AuthUser } from '../api/types';
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
  const steamLinked = hasLinkedSteamId(user?.steamId);
  const tradeUrlReady = hasTradeUrl(user?.tradeUrl);
  const steamBlocked = authenticated && requiresSteamLink && !steamLinked;
  const tradeUrlBlocked = authenticated && !steamBlocked && !tradeUrlReady;

  return (
    <div className="purchase-readiness-alerts">
      {steamBlocked ? (
        <div data-testid="purchase-steam-required">
          <ErrorAlert variant="info" title="Сначала привяжите Steam">
            Без привязанного Steam-аккаунта покупка недоступна. Перейдите в настройки аккаунта и
            привяжите Steam, затем вернитесь к оформлению.
          </ErrorAlert>
          <Link className="button secondary sm" to="/account">
            Перейти в аккаунт
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
              Trade URL не указан —{' '}
              <Link to="/account">укажите в аккаунте</Link> для покупки.
            </p>
          ) : (
            <>
              <strong>Trade URL не указан</strong>
              <p className="alert-body">
                Без Trade URL покупка недоступна — продавец не сможет отправить обмен в Steam.
              </p>
              <Link className="button secondary sm" to="/account">
                Указать Trade URL
              </Link>
            </>
          )}
        </div>
      ) : null}

      {authenticated && !steamBlocked && !tradeUrlBlocked && insufficientBalance ? (
        <div data-testid="purchase-insufficient-balance">
          <ErrorAlert variant="info" title="Недостаточно средств">
            {neededMinor
              ? `Для покупки нужно минимум ${formatUsdtFromMinor(neededMinor)} на балансе.`
              : 'Пополните кошелёк USDT (TRC-20), чтобы подтвердить покупку.'}
          </ErrorAlert>
          {showDepositAction && walletDepositHref ? (
            <Link
              className="button primary sm"
              to={walletDepositHref}
              data-testid="purchase-deposit-link"
            >
              Пополнить кошелёк
            </Link>
          ) : null}
        </div>
      ) : null}

      {authenticated && !steamBlocked && !tradeUrlBlocked && showTradeHint ? (
        <p className="purchase-trade-hint" data-testid="purchase-trade-hint">
          После покупки вам нужно будет принять trade offer в Steam.
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
