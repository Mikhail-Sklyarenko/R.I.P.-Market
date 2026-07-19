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

export const SUPPORT_TICKET_TOPICS: readonly SupportTicketTopic[] = [
  { id: 'deal', label: 'Проблема со сделкой / обменом' },
  { id: 'deposit', label: 'Пополнение баланса' },
  { id: 'withdrawal', label: 'Вывод средств' },
  { id: 'listing', label: 'Выставление предмета' },
  { id: 'extension', label: 'Расширение браузера' },
  { id: 'account', label: 'Аккаунт / Steam / Trade URL' },
  { id: 'other', label: 'Другое' },
] as const;

export const SUPPORT_TICKET_TOPIC_LABELS: readonly string[] =
  SUPPORT_TICKET_TOPICS.map((topic) => topic.label);

export function isSupportTicketTopicLabel(value: string): boolean {
  return SUPPORT_TICKET_TOPIC_LABELS.includes(value);
}
