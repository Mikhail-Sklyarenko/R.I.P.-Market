import { useEffect, useMemo, useState } from 'react';
import { getCatalogSteamPrices } from '../api/marketplace';
import { resolveSteamMarketHashName } from '../utils/steam-market-link';

const WEAR_PRICE_DEBOUNCE_MS = 350;

type UseWearSteamPriceOptions = {
  enabled?: boolean;
  /** When true, bypass cache and query Steam directly (wear changes on item page). */
  forceRefresh?: boolean;
};

export function useWearSteamPrice(
  marketHashName: string | undefined,
  wear: string,
  fallbackPriceMinor: number | null | undefined,
  options?: UseWearSteamPriceOptions,
) {
  const enabled = options?.enabled !== false;
  const forceRefresh = options?.forceRefresh === true;

  const steamMarketName = useMemo(() => {
    if (!marketHashName?.trim()) {
      return null;
    }
    return resolveSteamMarketHashName(marketHashName, wear || null);
  }, [marketHashName, wear]);

  const [steamPriceMinor, setSteamPriceMinor] = useState<number | null>(
    fallbackPriceMinor ?? null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSteamPriceMinor(fallbackPriceMinor ?? null);
  }, [marketHashName, fallbackPriceMinor]);

  useEffect(() => {
    if (!enabled || !steamMarketName) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    if (forceRefresh) {
      setSteamPriceMinor(null);
    }

    const timer = window.setTimeout(() => {
      void getCatalogSteamPrices([steamMarketName], { forceRefresh })
        .then((response) => {
          if (cancelled) {
            return;
          }
          const entry = response.prices[steamMarketName];
          setSteamPriceMinor(entry?.priceMinor ?? null);
        })
        .catch(() => {
          if (!cancelled) {
            setSteamPriceMinor(fallbackPriceMinor ?? null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, WEAR_PRICE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, steamMarketName, forceRefresh, fallbackPriceMinor]);

  return {
    steamMarketName,
    steamPriceMinor,
    loading,
  };
}
