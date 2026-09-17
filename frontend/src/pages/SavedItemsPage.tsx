import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCatalogItem } from '../api/marketplace';
import type { CatalogItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { EmptyState } from '../components/EmptyState';
import { InventoryPriceStack } from '../components/InventoryPriceStack';
import { PageHeader } from '../components/PageHeader';
import {
  readSavedItems,
  toggleSavedItem,
  SAVED_ITEMS_EVENT,
  type SavedItem,
} from '../utils/saved-items';

type SavedItemPrices = {
  steamPriceMinor: number | null;
  minMarketplacePriceMinor: string | null;
  steamPriceChange7dPct: number | null;
  steamPriceChange30dPct: number | null;
  loading: boolean;
};

export function SavedItemsPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [items, setItems] = useState(() => readSavedItems(user?.id));
  const [error, setError] = useState(false);
  const [pricesById, setPricesById] = useState<Record<string, SavedItemPrices>>(
    {},
  );

  useEffect(() => {
    const refresh = () => setItems(readSavedItems(user?.id));
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(SAVED_ITEMS_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(SAVED_ITEMS_EVENT, refresh);
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) {
      setPricesById({});
      return;
    }

    setPricesById((prev) => {
      const next: Record<string, SavedItemPrices> = {};
      for (const item of items) {
        next[item.id] = prev[item.id] ?? {
          steamPriceMinor: null,
          minMarketplacePriceMinor: null,
          steamPriceChange7dPct: null,
          steamPriceChange30dPct: null,
          loading: true,
        };
      }
      return next;
    });

    void Promise.all(
      items.map(async (item) => {
        try {
          const catalog: CatalogItem = await getCatalogItem(item.ref);
          if (cancelled) {
            return;
          }
          setPricesById((prev) => ({
            ...prev,
            [item.id]: {
              steamPriceMinor: catalog.steamPriceMinor,
              minMarketplacePriceMinor: catalog.minMarketplacePriceMinor,
              steamPriceChange7dPct: catalog.steamPriceChange7dPct ?? null,
              steamPriceChange30dPct: catalog.steamPriceChange30dPct ?? null,
              loading: false,
            },
          }));
        } catch {
          if (cancelled) {
            return;
          }
          setPricesById((prev) => ({
            ...prev,
            [item.id]: {
              steamPriceMinor: null,
              minMarketplacePriceMinor: null,
              steamPriceChange7dPct: null,
              steamPriceChange30dPct: null,
              loading: false,
            },
          }));
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [items]);

  function handleRemove(item: SavedItem) {
    setError(!toggleSavedItem(item, user?.id));
  }

  return (
    <div className="page saved-items-page">
      <PageHeader title={t('ux.savedTitle')} subtitle={t('ux.savedBody')} />

      {error ? (
        <div className="alert alert-error" role="alert" data-testid="saved-items-error">
          {t('ux.savedError')}
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={t('ux.savedTitle')}
          message={t('ux.savedEmpty')}
          action={
            <Link className="button primary" to="/catalog">
              {t('nav.catalog')}
            </Link>
          }
          testId="saved-items-empty"
        />
      ) : (
        <ul className="saved-items-list" data-testid="saved-items-list">
          {items.map((item) => {
            const prices = pricesById[item.id];
            return (
              <li className="card saved-item-card" key={item.id}>
                <div className="saved-item-card-body">
                  <h3 className="saved-item-card-title">{item.name}</h3>
                  <p className="muted small saved-item-card-ref">{item.ref}</p>
                  <InventoryPriceStack
                    steamPriceMinor={prices?.steamPriceMinor ?? null}
                    marketplacePriceMinor={
                      prices?.minMarketplacePriceMinor ?? null
                    }
                    steamPriceChange7dPct={
                      prices?.steamPriceChange7dPct ?? null
                    }
                    steamPriceChange30dPct={
                      prices?.steamPriceChange30dPct ?? null
                    }
                    loading={prices?.loading ?? true}
                    testIdPrefix={`saved-item-${item.id}`}
                    compact
                    context="buyer"
                  />
                </div>
                <div className="saved-item-card-actions">
                  <Link
                    to={`/catalog/items/${encodeURIComponent(item.ref)}`}
                    className="button primary sm"
                  >
                    {t('ux.savedOpen')}
                  </Link>
                  <button
                    type="button"
                    className="button ghost sm"
                    onClick={() => handleRemove(item)}
                  >
                    {t('ux.savedRemove')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
