import type { LedgerEntry } from '../api/types';
import { formatUsdFromMinor } from './format';

export const LEDGER_ENTRY_LABELS: Record<string, string> = {
  DEPOSIT: 'Пополнение',
  HOLD_RESERVE: 'Резерв (hold)',
  HOLD_RELEASE: 'Снятие резерва',
  SETTLEMENT_SELLER: 'Выплата продавцу',
  SETTLEMENT_PLATFORM_COMMISSION: 'Комиссия платформы',
  REFUND: 'Возврат средств',
  WITHDRAWAL: 'Вывод USDT',
  WITHDRAWAL_REFUND: 'Возврат вывода',
  WITHDRAW: 'Вывод USDT',
  WITHDRAW_FEE: 'Комиссия вывода',
  MANUAL_ADJUSTMENT: 'Ручная корректировка',
};

export function formatLedgerEntryType(type: string): string {
  return LEDGER_ENTRY_LABELS[type] ?? type;
}

export function resolveLedgerOrderId(entry: LedgerEntry): string | null {
  if (entry.orderId) {
    return entry.orderId;
  }
  const metadataOrderId = entry.metadata?.orderId;
  if (typeof metadataOrderId === 'string' && metadataOrderId.length > 0) {
    return metadataOrderId;
  }
  return null;
}

export function formatLedgerAmount(minor: string | number): string {
  const value = typeof minor === 'string' ? Number(minor) : minor;
  const formatted = formatUsdFromMinor(Math.abs(value));
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `−${formatted}`;
  }
  return formatted;
}

export function ledgerAmountClass(minor: string | number): string {
  const value = typeof minor === 'string' ? Number(minor) : minor;
  if (value > 0) {
    return 'ledger-amount-positive';
  }
  if (value < 0) {
    return 'ledger-amount-negative';
  }
  return '';
}
