export type WalletTab = 'deposit' | 'withdraw' | 'transactions';

export const WALLET_TABS: Array<{ id: WalletTab; label: string }> = [
  { id: 'deposit', label: 'Пополнение' },
  { id: 'withdraw', label: 'Вывод' },
  { id: 'transactions', label: 'Транзакции' },
];

export function parseWalletTab(value: string | null): WalletTab {
  if (value === 'withdraw' || value === 'transactions') {
    return value;
  }
  return 'deposit';
}

export function walletTabHref(tab: WalletTab): string {
  return `/wallet?tab=${tab}`;
}
