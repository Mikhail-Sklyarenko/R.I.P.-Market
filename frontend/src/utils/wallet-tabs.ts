import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

export type WalletTab = 'deposit' | 'withdraw' | 'transactions';

export function getWalletTabs(locale: Locale = 'ru'): Array<{ id: WalletTab; label: string }> {
  const t = (key: string) => translate(messagesByLocale[locale], key);
  return [
    { id: 'deposit', label: t('walletTabs.deposit') },
    { id: 'withdraw', label: t('walletTabs.withdraw') },
    { id: 'transactions', label: t('walletTabs.transactions') },
  ];
}

/** @deprecated Prefer getWalletTabs(locale) */
export const WALLET_TABS = getWalletTabs('ru');

export function parseWalletTab(value: string | null): WalletTab {
  if (value === 'withdraw' || value === 'transactions') {
    return value;
  }
  return 'deposit';
}

export function walletTabHref(tab: WalletTab): string {
  return `/wallet?tab=${tab}`;
}
