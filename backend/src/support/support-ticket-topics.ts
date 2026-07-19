export const SUPPORT_TICKET_TOPIC_LABELS = [
  'Проблема со сделкой / обменом',
  'Пополнение баланса',
  'Вывод средств',
  'Выставление предмета',
  'Расширение браузера',
  'Аккаунт / Steam / Trade URL',
  'Другое',
] as const;

export type SupportTicketTopicLabel =
  (typeof SUPPORT_TICKET_TOPIC_LABELS)[number];
