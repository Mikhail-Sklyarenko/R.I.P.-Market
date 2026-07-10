import { useWallet } from '../wallet/WalletContext';

export type { WalletSummary } from '../wallet/WalletContext';

export function useWalletSummary() {
  const { summary, loading, error, refresh, wallet } = useWallet();
  const availableMinor = summary !== null ? Number(summary.availableMinor) : null;

  return {
    summary,
    availableMinor,
    loading,
    error,
    refresh,
    wallet,
  };
}
