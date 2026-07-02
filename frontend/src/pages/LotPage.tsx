import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAuthConfig, getLot, listSimilarLots } from '../api/marketplace';
import type { Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DealFlowSteps } from '../components/DealFlowSteps';
import { ErrorAlert } from '../components/ErrorAlert';
import { EscrowNotice } from '../components/EscrowNotice';
import { ItemPreview } from '../components/ItemPreview';
import { LoadingState } from '../components/LoadingState';
import { LotBreadcrumbs } from '../components/LotBreadcrumbs';
import { MoneyDisplay } from '../components/MoneyDisplay';
import {
  isPurchaseBlockedBySteam,
  PurchaseReadinessAlerts,
} from '../components/PurchaseReadinessAlerts';
import { SimilarLots } from '../components/SimilarLots';
import { StatusBadge } from '../components/StatusBadge';
import { WearBar } from '../components/WearBar';
import {
  formatFloatValue,
  formatPaintSeed,
  getItemCategory,
} from '../utils/item-image';

export function LotPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Lot | null>(null);
  const [similarLots, setSimilarLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [requiresSteamLink, setRequiresSteamLink] = useState(false);

  const isOwnLot = Boolean(lot && user && lot.sellerId === user.id);
  const isSellerRole = user?.role === 'SELLER';
  const isUnavailable = lot?.status !== 'ACTIVE';
  const steamPurchaseBlocked = isPurchaseBlockedBySteam(user, requiresSteamLink, Boolean(token));
  const canProceed =
    lot?.status === 'ACTIVE' && !isOwnLot && !isSellerRole && !steamPurchaseBlocked;

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
    setError(null);
    getLot(id)
      .then(setLot)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || !lot) {
      return;
    }
    setSimilarLoading(true);
    listSimilarLots(id, 6)
      .then(setSimilarLots)
      .catch(() => setSimilarLots([]))
      .finally(() => setSimilarLoading(false));
  }, [id, lot]);

  function handleProceedToCheckout() {
    if (!id) {
      return;
    }
    if (!token) {
      navigate(`/login?returnUrl=${encodeURIComponent(`/lots/${id}/checkout`)}`);
      return;
    }
    navigate(`/lots/${id}/checkout`);
  }

  if (!id) {
    return null;
  }

  const asset = lot?.inventoryAsset;
  const floatText = asset ? formatFloatValue(asset.floatValue) : null;
  const patternText = asset ? formatPaintSeed(asset.paintSeed) : null;
  const category = asset ? getItemCategory(asset) : null;
  const wear = asset?.wear ?? null;

  return (
    <div className="page lot-page" data-testid="lot-page">
      {loading ? <LoadingState message="Загрузка лота…" /> : null}

      {lot && asset ? (
        <>
          <LotBreadcrumbs
            marketHashName={asset.itemDefinition.marketHashName}
            weapon={asset.itemDefinition.weapon}
            categoryLabel={asset.itemDefinition.rarity}
          />

          {isUnavailable ? (
            <SimilarLots lots={similarLots} loading={similarLoading} prominent />
          ) : null}

          <div className="lot-page-grid">
            <div className="lot-page-main">
              <div className="card lot-preview-card">
                <ItemPreview
                  item={asset}
                  title={asset.itemDefinition.marketHashName}
                  size="lg"
                  showAttrs={false}
                />

                {asset.floatValue !== null && asset.floatValue !== undefined && asset.floatValue !== '' ? (
                  <WearBar floatValue={asset.floatValue} />
                ) : null}

                <dl className="lot-attrs-grid meta-list">
                  {category ? (
                    <div>
                      <dt>Категория</dt>
                      <dd data-testid="lot-attr-category">{category}</dd>
                    </div>
                  ) : null}
                  {wear ? (
                    <div>
                      <dt>Износ</dt>
                      <dd data-testid="lot-attr-wear">{wear}</dd>
                    </div>
                  ) : null}
                  {floatText ? (
                    <div>
                      <dt>Float</dt>
                      <dd data-testid="lot-attr-float">{floatText}</dd>
                    </div>
                  ) : null}
                  {patternText ? (
                    <div>
                      <dt>Pattern</dt>
                      <dd data-testid="lot-attr-pattern">{patternText}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>

            <aside className="lot-page-sidebar">
              <div className="card lot-purchase-card">
                <div className="lot-purchase-card-header">
                  <StatusBadge status={lot.status} />
                </div>

                <p className="lot-purchase-price" data-testid="lot-purchase-price">
                  <MoneyDisplay minor={lot.priceMinor} strong />
                </p>

                <details className="lot-pricing-details">
                  <summary className="lot-pricing-details-summary">
                    Комиссия и выплата продавцу
                  </summary>
                  <div className="pricing-preview lot-pricing-details-body">
                    <div>
                      <span>Комиссия</span>
                      <MoneyDisplay minor={lot.commissionMinor} strong />
                    </div>
                    <div>
                      <span>Продавец получит</span>
                      <MoneyDisplay minor={lot.sellerReceiveMinor} strong />
                    </div>
                  </div>
                </details>

                <ErrorAlert error={error} />

                {token && !isSellerRole && !isOwnLot && !isUnavailable ? (
                  <PurchaseReadinessAlerts
                    user={user}
                    requiresSteamLink={requiresSteamLink}
                    authenticated
                  />
                ) : null}

                {isUnavailable ? (
                  <p className="muted" data-testid="lot-unavailable-message">
                    Лот недоступен для покупки ({lot.status}).
                  </p>
                ) : null}

                {isOwnLot ? (
                  <p className="muted" data-testid="own-lot-message">
                    Вы не можете купить свой лот.
                  </p>
                ) : null}

                {isSellerRole ? (
                  <p className="muted" data-testid="seller-cannot-buy-message">
                    Войдите как покупатель, чтобы оформить покупку.
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button primary lot-purchase-button"
                      disabled={!canProceed}
                      data-testid="buy-lot-button"
                      onClick={handleProceedToCheckout}
                    >
                      {!token ? 'Войти для покупки' : 'Купить сейчас'}
                    </button>
                    {canProceed ? <EscrowNotice /> : null}
                  </>
                )}
              </div>
            </aside>
          </div>

          {!isUnavailable ? (
            <SimilarLots lots={similarLots} loading={similarLoading} />
          ) : null}

          <DealFlowSteps />
        </>
      ) : null}

      {!loading && !lot && error ? <ErrorAlert error={error} /> : null}
    </div>
  );
}
