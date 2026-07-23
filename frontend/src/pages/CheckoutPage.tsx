import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createOrder, getAuthConfig, getLot } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { DealFlowSteps } from '../components/DealFlowSteps';
import { ErrorAlert } from '../components/ErrorAlert';
import { EscrowNotice } from '../components/EscrowNotice';
import { ItemParamsPanel } from '../components/ItemParamsPanel';
import { ItemPreview } from '../components/ItemPreview';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import {
  isPurchaseBlocked,
  PurchaseReadinessAlerts,
} from '../components/PurchaseReadinessAlerts';
import { useWalletSummary } from '../hooks/useWalletSummary';
import { formatUsdtFromMinor } from '../utils/format';

export function CheckoutPage() {
  const { id } = useParams();
  const { t } = useLocale();
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
  const shortfallMinor =
    insufficient && availableMinor !== null ? priceMinor - availableMinor : 0;
  const isOwnLot = Boolean(lot && user && lot.sellerId === user.id);
  const purchaseBlocked = isPurchaseBlocked(user, requiresSteamLink);
  const canConfirm =
    lot?.status === 'ACTIVE' &&
    !insufficient &&
    !isOwnLot &&
    !purchaseBlocked &&
    !confirming;

  const asset = lot?.inventoryAsset;

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
      <div className="page checkout-page">
        <PageHeader
          title={t('checkout.title')}
          subtitle={
            <Link to={`/lots/${id}`} className="muted">
              {t('checkout.backToLot')}
            </Link>
          }
        />
        <div className="card">
          <p className="muted" data-testid="checkout-unavailable">
            {t('checkout.unavailable', { status: lot.status })}
          </p>
          <Link to="/catalog" className="button secondary">
            {t('checkout.toCatalog')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page checkout-page">
      <PageHeader
        title={t('checkout.title')}
        subtitle={
          <Link to={`/lots/${id}`} className="muted">
            {t('checkout.backToLot')}
          </Link>
        }
      />

      {loading || walletLoading ? <LoadingState message={t('checkout.loading')} /> : null}

      {lot && asset ? (
        <div className="checkout-page-grid" data-testid="checkout-page">
          <div className="checkout-page-main">
            <div className="card checkout-item-card">
              <ItemPreview
                item={asset}
                title={asset.itemDefinition.marketHashName}
                size="lg"
                showAttrs={false}
              />

              <ItemParamsPanel item={asset} testId="checkout-params" />
            </div>
          </div>

          <aside className="checkout-page-sidebar">
            <div className="card checkout-purchase-card">
              <div className="checkout-pricing" data-testid="checkout-pricing">
                <p className="checkout-pay-label">{t('checkout.payLabel')}</p>
                <p className="checkout-pay-price">
                  <MoneyDisplay minor={lot.priceMinor} strong />
                </p>
              </div>

              {summary ? (
                <div className="checkout-wallet-summary" data-testid="checkout-wallet">
                  <div className="checkout-wallet-row">
                    <span>{t('checkout.available')}</span>
                    <MoneyDisplay minor={summary.availableMinor} strong />
                  </div>
                  {insufficient && shortfallMinor > 0 ? (
                    <div className="checkout-wallet-row checkout-wallet-shortfall">
                      <span>{t('checkout.shortfall')}</span>
                      <MoneyDisplay minor={shortfallMinor} strong />
                    </div>
                  ) : null}
                  {Number(summary.holdMinor) > 0 ? (
                    <div className="checkout-wallet-row checkout-wallet-muted">
                      <span>{t('checkout.hold')}</span>
                      <MoneyDisplay minor={summary.holdMinor} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isOwnLot ? (
                <p className="muted small" data-testid="own-lot-message">
                  {t('checkout.ownLot')}
                </p>
              ) : null}

              <PurchaseReadinessAlerts
                user={user}
                requiresSteamLink={requiresSteamLink}
                authenticated={Boolean(token && user)}
                insufficientBalance={insufficient}
                neededMinor={priceMinor}
                walletDepositHref={`/wallet?tab=deposit&returnUrl=${encodeURIComponent(checkoutPath)}&needed=${priceMinor}`}
                showDepositAction={false}
                showTradeHint={false}
                compactTradeUrlWarning
              />

              <p className="checkout-footnote" data-testid="purchase-trade-hint">
                {t('checkout.tradeHint')}
              </p>
              <EscrowNotice compact />

              <DealFlowSteps compact />

              <ErrorAlert error={error} />

              <div className="checkout-actions">
                {insufficient ? (
                  <Link
                    to={`/wallet?tab=deposit&returnUrl=${encodeURIComponent(checkoutPath)}&needed=${priceMinor}`}
                    className="button primary"
                    data-testid="checkout-deposit-link"
                  >
                    {t('checkout.depositButton')}
                    {shortfallMinor > 0
                      ? ` · ${formatUsdtFromMinor(shortfallMinor)}`
                      : ''}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="button primary"
                    disabled={!canConfirm}
                    data-testid="confirm-purchase-button"
                    onClick={() => void handleConfirm()}
                  >
                    {confirming ? t('checkout.confirming') : t('checkout.confirmButton')}
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
