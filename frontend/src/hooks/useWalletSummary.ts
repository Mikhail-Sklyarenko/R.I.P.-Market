import { useCallback, useEffect, useState } from 'react';
import { getWallet } from '../api/marketplace';
import type { Wallet } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export type WalletSummary = Wallet['summary'];

export function useWalletSummary() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setSummary(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const wallet = await getWallet(token);
      setSummary(wallet.summary);
    } catch (err) {
      setError(err);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const availableMinor =
    summary !== null ? Number(summary.availableMinor) : null;

  return {
    summary,
    availableMinor,
    loading,
    error,
    refresh,
  };
}
