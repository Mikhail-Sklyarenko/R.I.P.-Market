import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale) {
  return translate(messagesByLocale[locale], key);
}

/** @deprecated Prefer formatWithdrawalStatus(status, locale) */
export const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'На проверке',
  APPROVED: 'Одобрено',
  PROCESSING: 'В обработке',
  PAID: 'Выплачено',
  REJECTED: 'Отклонено',
  FAILED: 'Ошибка',
};

export function formatWithdrawalStatus(status: string, locale: Locale = 'ru'): string {
  return t(`withdrawalStatus.${status}`, locale);
}

export function withdrawalStatusClass(status: string): string {
  switch (status) {
    case 'PAID':
      return 'withdrawal-status-paid';
    case 'PENDING_REVIEW':
      return 'withdrawal-status-pending';
    case 'REJECTED':
    case 'FAILED':
      return 'withdrawal-status-failed';
    default:
      return 'withdrawal-status-processing';
  }
}
