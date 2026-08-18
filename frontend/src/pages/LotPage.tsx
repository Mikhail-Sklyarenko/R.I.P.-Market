import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAuthConfig, getCatalogItem, getLot, listSimilarLots } from '../api/marketplace';
import type { CatalogItem, Lot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingState } from '../components/LoadingState';
import { LotBreadcrumbs } from '../components/LotBreadcrumbs';
import { LotListingDetail } from '../components/LotListingDetail';
import { getRarityDisplayLabel } from '../utils/rarity-colors';
import { getCatalogItemRef } from '../utils/item-slug';
import { resolveLotDisplayItem } from '../utils/lot-display';
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
    setSimilarLoading(true);
    setError(null);
    setSimilarLots([]);
    void getLot(id)
      .then(setLot)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
    void listSimilarLots(id, 6)
      .then(setSimilarLots)
      .catch(() => setSimilarLots([]))
      .finally(() => setSimilarLoading(false));
  }, [id]);

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

          <LotListingDetail
            lot={lot}
            token={token}
            user={user}
            requiresSteamLink={requiresSteamLink}
            purchaseError={error}
            siblingOfferCount={siblingOfferCount}
            catalogItemPath={catalogItemPath}
            similarLots={similarLots}
            similarLoading={similarLoading}
            onBuy={handleProceedToCheckout}
          />
        </>
      ) : null}

      {!loading && !lot && error ? <ErrorAlert error={error} /> : null}
    </div>
  );
}
