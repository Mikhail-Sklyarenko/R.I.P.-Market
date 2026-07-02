import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createOrder, getAuthConfig, getLot } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import { DealFlowSteps } from '../components/DealFlowSteps';
import { ErrorAlert } from '../components/ErrorAlert';
import { EscrowNotice } from '../components/EscrowNotice';
import { ItemPreview } from '../components/ItemPreview';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import {
  isPurchaseBlockedBySteam,
  PurchaseReadinessAlerts,
} from '../components/PurchaseReadinessAlerts';
import { useWalletSummary } from '../hooks/useWalletSummary';

export function CheckoutPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { summary, availableMinor, loading: walletLoading, refresh } = useWalletSummary();
  const [lot, setLot] = useState<Awaited<ReturnType<typeof getLot>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [requiresSteamLink, setRequiresSteamLink] = useState(false);

  const checkoutPath = id ? `/lots/${id}/checkout` : '/catalog';
  const priceMinor = lot ? Number(lot.priceMinor) : 0;
  const insufficient =
    availableMinor !== null && priceMinor > 0 && availableMinor < priceMinor;
  const remainder =
    availableMinor !== null && priceMinor > 0 ? availableMinor - priceMinor : null;
  const isOwnLot = Boolean(lot && user && lot.sellerId === user.id);
  const steamPurchaseBlocked = isPurchaseBlockedBySteam(user, requiresSteamLink);
  const canConfirm =
    lot?.status === 'ACTIVE' &&
    !insufficient &&
    user?.role !== 'SELLER' &&
    !isOwnLot &&
    !steamPurchaseBlocked &&
    !confirming;

  useEffect(() => {
    getAuthConfig()
      .then((config) => setRequiresSteamLink(config.inventoryProvider === 'steam'))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    getLot(id)
      .then(setLot)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleConfirm() {
    if (!token || !lot || !canConfirm) {
      return;
    }

    setConfirming(true);
    setError(null);
    try {
      const order = await createOrder(token, lot.id);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setConfirming(false);
    }
  }

  if (!id) {
    return null;
  }

  if (lot && lot.status !== 'ACTIVE') {
    return (
      <div className="page">
        <PageHeader
          title="Подтверждение покупки"
          subtitle={
            <Link to={`/lots/${id}`} className="muted">
              Назад к лоту
            </Link>
          }
        />
        <div className="card">
          <p className="muted" data-testid="checkout-unavailable">
            Лот недоступен для покупки ({lot.status}).
          </p>
          <Link to="/catalog" className="button secondary">
            В каталог
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Подтверждение покупки"
        subtitle={
          <Link to={`/lots/${id}`} className="muted">
            Назад к лоту
          </Link>
        }
      />

      {loading || walletLoading ? <LoadingState message="Загрузка…" /> : null}

      {lot ? (
        <div className="card form-card checkout-card" data-testid="checkout-page">
          <ItemPreview
            item={lot.inventoryAsset}
            title={lot.inventoryAsset.itemDefinition.marketHashName}
            size="md"
          />

          <div className="pricing-preview" data-testid="checkout-pricing">
            <div>
              <span>Цена лота</span>
              <MoneyDisplay minor={lot.priceMinor} strong />
            </div>
            <div>
              <span>Комиссия маркетплейса</span>
              <MoneyDisplay minor={lot.commissionMinor} strong />
            </div>
            <div>
              <span>Итого к оплате</span>
              <MoneyDisplay minor={lot.priceMinor} strong />
            </div>
          </div>

          {summary ? (
            <div className="pricing-preview" data-testid="checkout-wallet">
              <div>
                <span>Доступно</span>
                <MoneyDisplay minor={summary.availableMinor} strong />
              </div>
              <div>
                <span>На hold</span>
                <MoneyDisplay minor={summary.holdMinor} strong />
              </div>
              {remainder !== null ? (
                <div>
                  <span>Останется после покупки</span>
                  <MoneyDisplay
                    minor={Math.max(remainder, 0)}
                    strong
                    className={insufficient ? 'money-insufficient' : undefined}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {isOwnLot ? (
            <p className="muted" data-testid="own-lot-message">
              Вы не можете купить свой лот.
            </p>
          ) : null}

          {user?.role === 'SELLER' ? (
            <p className="muted" data-testid="seller-cannot-buy-message">
              Войдите как покупатель, чтобы оформить покупку.
            </p>
          ) : null}

          <PurchaseReadinessAlerts
            user={user}
            requiresSteamLink={requiresSteamLink}
            authenticated={Boolean(token && user)}
            insufficientBalance={insufficient}
            neededMinor={priceMinor}
            walletDepositHref={`/wallet?returnUrl=${encodeURIComponent(checkoutPath)}&needed=${priceMinor}`}
          />

          <DealFlowSteps compact />
          <EscrowNotice />

          <ErrorAlert error={error} />

          <div className="checkout-actions">
            {insufficient ? (
              <Link
                to={`/wallet?returnUrl=${encodeURIComponent(checkoutPath)}&needed=${priceMinor}`}
                className="button primary"
                data-testid="checkout-deposit-link"
              >
                Пополнить кошелёк
              </Link>
            ) : (
              <button
                type="button"
                className="button primary"
                disabled={!canConfirm}
                data-testid="confirm-purchase-button"
                onClick={() => void handleConfirm()}
              >
                {confirming ? 'Создаём сделку…' : 'Подтвердить покупку'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
