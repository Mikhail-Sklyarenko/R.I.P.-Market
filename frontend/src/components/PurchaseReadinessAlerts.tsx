import { Link } from 'react-router-dom';
import type { AuthUser } from '../api/types';
import { ErrorAlert } from './ErrorAlert';
import { hasLinkedSteamId } from '../utils/steam-id';
import { formatUsdtFromMinor } from '../utils/format';

type PurchaseReadinessAlertsProps = {
  user: AuthUser | null;
  requiresSteamLink: boolean;
  authenticated?: boolean;
  insufficientBalance?: boolean;
  walletDepositHref?: string;
  neededMinor?: number;
};

export function PurchaseReadinessAlerts({
  user,
  requiresSteamLink,
  authenticated = Boolean(user),
  insufficientBalance = false,
  walletDepositHref,
  neededMinor,
}: PurchaseReadinessAlertsProps) {
  const steamLinked = hasLinkedSteamId(user?.steamId);
  const tradeUrlReady = Boolean(user?.tradeUrl?.trim());
  const steamBlocked = authenticated && requiresSteamLink && !steamLinked;

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

      {authenticated && !steamBlocked && !tradeUrlReady ? (
        <div className="alert alert-warning" data-testid="purchase-trade-url-warning">
          <strong>Trade URL не указан</strong>
          <p className="alert-body">
            Покупку можно оформить, но для обмена в Steam продавцу понадобится ваша Trade URL.
            Рекомендуем указать её в аккаунте до принятия trade offer.
          </p>
          <Link className="button secondary sm" to="/account">
            Указать Trade URL
          </Link>
        </div>
      ) : null}

      {authenticated && !steamBlocked && insufficientBalance ? (
        <div data-testid="purchase-insufficient-balance">
          <ErrorAlert variant="info" title="Недостаточно средств">
            {neededMinor
              ? `Для покупки нужно минимум ${formatUsdtFromMinor(neededMinor)} на балансе.`
              : 'Пополните кошелёк USDT (TRC-20), чтобы подтвердить покупку.'}
          </ErrorAlert>
          {walletDepositHref ? (
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

      {authenticated && !steamBlocked ? (
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
