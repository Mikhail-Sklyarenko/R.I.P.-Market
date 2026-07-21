import { useEffect, useMemo, useState } from 'react';
import { getCatalogSteamPrices } from '../api/marketplace';
import { resolveSteamMarketHashName } from '../utils/steam-market-link';

const WEAR_PRICE_DEBOUNCE_MS = 350;

type WearSteamPriceCacheEntry = {
  priceMinor: number | null;
  fetchedAt: string | null;
};

const sessionWearPriceCache = new Map<string, WearSteamPriceCacheEntry>();

type UseWearSteamPriceOptions = {
  enabled?: boolean;
};

export function useWearSteamPrice(
  marketHashName: string | undefined,
  wear: string,
  fallbackPriceMinor: number | null | undefined,
  options?: UseWearSteamPriceOptions,
) {
  const enabled = options?.enabled !== false;

  const steamMarketName = useMemo(() => {
    if (!marketHashName?.trim()) {
      return null;
    }
    return resolveSteamMarketHashName(marketHashName, wear || null);
  }, [marketHashName, wear]);

  const sessionEntry = steamMarketName
    ? sessionWearPriceCache.get(steamMarketName)
    : undefined;

  const [steamPriceMinor, setSteamPriceMinor] = useState<number | null>(
    sessionEntry?.priceMinor ?? fallbackPriceMinor ?? null,
  );
  const [steamPriceFetchedAt, setSteamPriceFetchedAt] = useState<string | null>(
    sessionEntry?.fetchedAt ?? null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!steamMarketName) {
      setSteamPriceMinor(fallbackPriceMinor ?? null);
      setSteamPriceFetchedAt(null);
      return;
    }
    const cached = sessionWearPriceCache.get(steamMarketName);
    if (cached) {
      setSteamPriceMinor(cached.priceMinor);
      setSteamPriceFetchedAt(cached.fetchedAt);
      return;
    }
    setSteamPriceMinor(fallbackPriceMinor ?? null);
    setSteamPriceFetchedAt(null);
  }, [marketHashName, fallbackPriceMinor, steamMarketName]);

  useEffect(() => {
    if (!enabled || !steamMarketName) {
      setLoading(false);
      return;
    }

    const cached = sessionWearPriceCache.get(steamMarketName);
    if (cached) {
      setSteamPriceMinor(cached.priceMinor);
      setSteamPriceFetchedAt(cached.fetchedAt);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = window.setTimeout(() => {
      void getCatalogSteamPrices([steamMarketName])
        .then((response) => {
          if (cancelled) {
            return;
          }
          const entry = response.prices[steamMarketName];
          const priceMinor = entry?.priceMinor ?? null;
          const fetchedAt = entry?.fetchedAt ?? null;
          sessionWearPriceCache.set(steamMarketName, { priceMinor, fetchedAt });
          setSteamPriceMinor(priceMinor);
          setSteamPriceFetchedAt(fetchedAt);
        })
        .catch(() => {
          if (!cancelled) {
            setSteamPriceMinor(fallbackPriceMinor ?? null);
            setSteamPriceFetchedAt(null);
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
  }, [enabled, steamMarketName, fallbackPriceMinor]);

  return {
    steamMarketName,
    steamPriceMinor,
    steamPriceFetchedAt,
    loading: loading && steamPriceMinor == null,
  };
}
