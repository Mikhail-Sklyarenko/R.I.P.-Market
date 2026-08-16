import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAuthConfig, getCatalogItem, getLot, listSimilarLots } from '../api/marketplace';
import type { CatalogItem, Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { ErrorAlert } from '../components/ErrorAlert';
import { LotActionButtons } from '../components/LotActionButtons';
import { LotItemHero } from '../components/LotItemHero';
import { ItemParamsPanel } from '../components/ItemParamsPanel';
import { LotStickers } from '../components/LotStickers';
import { LoadingState } from '../components/LoadingState';
import { LotBreadcrumbs } from '../components/LotBreadcrumbs';
import { LotPurchaseCard } from '../components/LotPurchaseCard';
import {
  isPurchaseBlocked,
} from '../components/PurchaseReadinessAlerts';
import { getRarityDisplayLabel } from '../utils/rarity-colors';
import { SimilarLots } from '../components/SimilarLots';
import { formatDataTimestamp, resolveLotDisplayItem } from '../utils/lot-display';
import { getCatalogItemRef } from '../utils/item-slug';
import { startSteamLogin } from '../utils/start-steam-login';

export function LotPage() {
  const { id } = useParams();
  const { locale, t } = useLocale();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Lot | null>(null);
  const [similarLots, setSimilarLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [requiresSteamLink, setRequiresSteamLink] = useState(false);
  const [siblingOfferCount, setSiblingOfferCount] = useState<number | null>(null);
  const [catalogItem, setCatalogItem] = useState<CatalogItem | null>(null);

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
      setCatalogItem(null);
      return;
    }
    getCatalogItem(itemDefinitionId)
      .then((item) => {
        setCatalogItem(item);
        setSiblingOfferCount(item.activeLotCount);
      })
      .catch(() => {
        setCatalogItem(null);
        setSiblingOfferCount(null);
      });
  }, [itemDefinitionId]);

  const catalogItemPath =
    catalogItem && itemDefinitionId
      ? `/catalog/items/${getCatalogItemRef(catalogItem)}`
      : itemDefinitionId
        ? `/catalog/items/${itemDefinitionId}`
        : null;

  async function handleProceedToCheckout() {
    if (!id) {
      return;
    }
    if (!token) {
      try {
        await startSteamLogin(`/lots/${id}/checkout`);
      } catch {
        // Stay on lot; user can retry via header Steam CTA.
      }
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
      {loading ? <LoadingState message={t('lot.loading')} /> : null}

      {lot && asset && displayItem ? (
        <>
          <LotBreadcrumbs
            marketHashName={displayItem.itemDefinition.marketHashName}
            weapon={displayItem.itemDefinition.weapon}
            categoryLabel={getRarityDisplayLabel(displayItem.itemDefinition.rarity, locale)}
          />

          {isUnavailable ? (
            <SimilarLots lots={similarLots} loading={similarLoading} prominent />
          ) : null}

          <div className="lot-page-grid">
            <div className="lot-page-main">
              <div className="card lot-preview-card" data-testid="lot-preview-card">
                <LotItemHero item={displayItem} />

                <div className="lot-preview-card-body">
                  <ItemParamsPanel item={displayItem} testId="lot-spec" showEmptyFloat />

                  <LotStickers stickers={displayItem.stickers} testIdPrefix="lot" />

                  {snapshotCapturedAt ? (
                    <p className="muted small lot-preview-meta" data-testid="lot-snapshot-captured-at">
                      {t('lot.snapshotCaptured', { when: snapshotCapturedAt })}
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
            </div>

            <aside className="lot-page-sidebar">
              <LotPurchaseCard
                lot={lot}
                displayItem={displayItem}
                token={token}
                user={user}
                canProceed={canProceed}
                isOwnLot={isOwnLot}
                isUnavailable={isUnavailable}
                showPurchaseBlockers={showPurchaseBlockers}
                requiresSteamLink={requiresSteamLink}
                siblingOfferCount={siblingOfferCount}
                catalogItemPath={catalogItemPath}
                purchaseError={error}
                onBuy={handleProceedToCheckout}
              />
            </aside>
          </div>

          {!isUnavailable ? (
            <SimilarLots lots={similarLots} loading={similarLoading} />
          ) : null}
        </>
      ) : null}

      {!loading && !lot && error ? <ErrorAlert error={error} /> : null}
    </div>
  );
}
