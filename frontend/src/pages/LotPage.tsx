import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAuthConfig, getCatalogItem, getLot, listSimilarLots } from '../api/marketplace';
import type { Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DealFlowSteps } from '../components/DealFlowSteps';
import { ErrorAlert } from '../components/ErrorAlert';
import { InventoryPriceStack } from '../components/InventoryPriceStack';
import { LotActionButtons } from '../components/LotActionButtons';
import { LotItemHero } from '../components/LotItemHero';
import { ItemParamsPanel } from '../components/ItemParamsPanel';
import { LotStickers } from '../components/LotStickers';
import { LoadingState } from '../components/LoadingState';
import { LotBreadcrumbs } from '../components/LotBreadcrumbs';
import { MoneyDisplay } from '../components/MoneyDisplay';
import {
  isPurchaseBlocked,
  PurchaseReadinessAlerts,
} from '../components/PurchaseReadinessAlerts';
import { getRarityDisplayLabel } from '../utils/rarity-colors';
import { SimilarLots } from '../components/SimilarLots';
import { StatusBadge } from '../components/StatusBadge';
import { formatDataTimestamp, resolveLotDisplayItem } from '../utils/lot-display';

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
  const [siblingOfferCount, setSiblingOfferCount] = useState<number | null>(null);

  const isOwnLot = Boolean(lot && user && lot.sellerId === user.id);
  const isUnavailable = lot?.status !== 'ACTIVE';
  const steamPurchaseBlocked = isPurchaseBlocked(user, requiresSteamLink, Boolean(token));
  const canProceed =
    lot?.status === 'ACTIVE' && !isOwnLot && !steamPurchaseBlocked;

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

  const itemDefinitionId =
    lot?.inventoryAsset.itemDefinitionId ?? lot?.inventoryAsset.itemDefinition.id ?? null;

  useEffect(() => {
    if (!itemDefinitionId) {
      setSiblingOfferCount(null);
      return;
    }
    getCatalogItem(itemDefinitionId)
      .then((item) => setSiblingOfferCount(item.activeLotCount))
      .catch(() => setSiblingOfferCount(null));
  }, [itemDefinitionId]);

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
  const displayItem = lot ? resolveLotDisplayItem(lot) : null;
  const snapshotCapturedAt = formatDataTimestamp(displayItem?.capturedAt ?? null);
  const showPurchaseBlockers =
    Boolean(token) && !isOwnLot && !isUnavailable && steamPurchaseBlocked;

  return (
    <div className="page lot-page" data-testid="lot-page">
      {loading ? <LoadingState message="Загрузка лота…" /> : null}

      {lot && asset && displayItem ? (
        <>
          <LotBreadcrumbs
            marketHashName={displayItem.itemDefinition.marketHashName}
            weapon={displayItem.itemDefinition.weapon}
            categoryLabel={getRarityDisplayLabel(displayItem.itemDefinition.rarity)}
          />

          {isUnavailable ? (
            <SimilarLots lots={similarLots} loading={similarLoading} prominent />
          ) : null}

          <div className="lot-page-grid">
            <div className="lot-page-main">
              <div className="card lot-preview-card">
                <LotItemHero item={displayItem} />

                <ItemParamsPanel item={displayItem} testId="lot-spec" />

                <LotStickers stickers={displayItem.stickers} testIdPrefix="lot" />

                {snapshotCapturedAt ? (
                  <p className="muted small" data-testid="lot-snapshot-captured-at">
                    Характеристики зафиксированы при выставлении: {snapshotCapturedAt}
                  </p>
                ) : null}

                <LotActionButtons
                  inspectLink={lot.inspectLink}
                  steamMarketUrl={lot.steamMarketUrl}
                  steamMarketHashName={
                    lot.steamMarketHashName ??
                    displayItem.itemDefinition.marketHashName
                  }
                />
              </div>
            </div>

            <aside className="lot-page-sidebar">
              <div className="card lot-purchase-card">
                <div className="lot-purchase-card-header">
                  <StatusBadge status={lot.status} />
                </div>

                <div className="lot-purchase-price" data-testid="lot-purchase-price">
                  <InventoryPriceStack
                    steamPriceMinor={lot.steamPriceMinor}
                    marketplacePriceMinor={lot.marketplacePriceMinor ?? lot.priceMinor}
                    testIdPrefix="lot"
                  />
                </div>

                {siblingOfferCount && siblingOfferCount > 1 && itemDefinitionId ? (
                  <Link
                    to={`/catalog/items/${itemDefinitionId}`}
                    className="lot-compare-offers-link muted small"
                    data-testid="lot-compare-offers-link"
                  >
                    Все предложения ({siblingOfferCount})
                  </Link>
                ) : null}

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

                {showPurchaseBlockers ? (
                  <PurchaseReadinessAlerts
                    user={user}
                    requiresSteamLink={requiresSteamLink}
                    authenticated
                    showTradeHint={false}
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

                <button
                  type="button"
                  className="button primary lot-purchase-button"
                  disabled={!canProceed}
                  data-testid="buy-lot-button"
                  onClick={handleProceedToCheckout}
                >
                  {!token ? 'Войти для покупки' : 'Купить сейчас'}
                </button>
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
