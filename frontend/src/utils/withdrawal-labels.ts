export const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'На проверке',
  APPROVED: 'Одобрено',
  PROCESSING: 'В обработке',
  PAID: 'Выплачено',
  REJECTED: 'Отклонено',
  FAILED: 'Ошибка',
};

export function formatWithdrawalStatus(status: string): string {
  return WITHDRAWAL_STATUS_LABELS[status] ?? status;
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
