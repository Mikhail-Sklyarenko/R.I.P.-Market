import type { PaymentStatus, WithdrawalStatus } from '@prisma/client';

const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  detected: ['held', 'rejected'],
  held: ['credited', 'rejected'],
  credited: [],
  rejected: [],
};

const WITHDRAWAL_TRANSITIONS: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  pending: ['processing', 'failed'],
  processing: ['paid', 'failed'],
  paid: [],
  failed: [],
};

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionWithdrawal(
  from: WithdrawalStatus,
  to: WithdrawalStatus,
): boolean {
  return WITHDRAWAL_TRANSITIONS[from].includes(to);
}

export function nextPaymentStatus(
  current: PaymentStatus,
  confirmations: number,
  minConfirmations: number,
): PaymentStatus | null {
  if (current === 'detected' && confirmations >= minConfirmations) {
    return 'held';
  }
  if (current === 'held') {
    return 'credited';
  }
  return null;
}
