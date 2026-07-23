import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

export type SupportTicketTopicId =
  | 'deal'
  | 'deposit'
  | 'withdrawal'
  | 'listing'
  | 'extension'
  | 'account'
  | 'other';

export type SupportTicketTopic = {
  id: SupportTicketTopicId;
  label: string;
};

export const SUPPORT_TICKET_TOPIC_IDS: readonly SupportTicketTopicId[] = [
  'deal',
  'deposit',
  'withdrawal',
  'listing',
  'extension',
  'account',
  'other',
] as const;

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

export function supportTicketTopicLabel(
  id: SupportTicketTopicId,
  locale: Locale = 'ru',
): string {
  return translate(messagesByLocale[locale], `support.topic.${id}`);
}

/** @deprecated Prefer SUPPORT_TICKET_TOPIC_IDS + supportTicketTopicLabel(locale) */
export const SUPPORT_TICKET_TOPICS: readonly SupportTicketTopic[] =
  SUPPORT_TICKET_TOPIC_IDS.map((id) => ({
    id,
    label: supportTicketTopicLabel(id, 'ru'),
  }));

export const SUPPORT_TICKET_TOPIC_LABELS: readonly string[] = [
  ...SUPPORT_TICKET_TOPIC_IDS.map((id) => supportTicketTopicLabel(id, 'ru')),
  ...SUPPORT_TICKET_TOPIC_IDS.map((id) => supportTicketTopicLabel(id, 'en')),
];

export function isSupportTicketTopicLabel(value: string): boolean {
  return SUPPORT_TICKET_TOPIC_LABELS.includes(value);
}
