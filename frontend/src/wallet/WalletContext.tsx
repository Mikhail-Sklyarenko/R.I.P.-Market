import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getWallet, getWalletTransactions } from '../api/marketplace';
import type { LedgerEntry, Wallet } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export type WalletSummary = Wallet['summary'];

type WalletContextValue = {
  wallet: Wallet | null;
  summary: WalletSummary | null;
  transactions: LedgerEntry[];
  loading: boolean;
  error: unknown;
  refresh: () => Promise<Wallet | null>;
  applyWallet: (wallet: Wallet) => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async (): Promise<Wallet | null> => {
    if (!token) {
      setWallet(null);
      setTransactions([]);
      setError(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const [walletData, txData] = await Promise.all([
        getWallet(token),
        getWalletTransactions(token),
      ]);
      setWallet(walletData);
      setTransactions(txData);
      return walletData;
    } catch (err) {
      setError(err);
      return wallet;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const applyWallet = useCallback((next: Wallet) => {
    setWallet(next);
    setError(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallet,
      summary: wallet?.summary ?? null,
      transactions,
      loading,
      error,
      refresh,
      applyWallet,
    }),
    [wallet, transactions, loading, error, refresh, applyWallet],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
