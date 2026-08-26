/**
 * G1: Settlement transparency for popup — funds available date + delivery progress.
 * H1: copy follows extension locale.
 */
import type {
  ActiveTradeDeliveryProgress,
  ActiveTradeDeliverySignalTone,
  TradeVerificationResult,
} from '@rip-market/extension-orchestrator';
import {
  createExtensionT,
  DEFAULT_EXTENSION_LOCALE,
  localeToBcp47,
  type ExtensionLocale,
} from './extension-i18n.js';

export type SettlementTransparencyPhase =
  | 'delivery_verifying'
  | 'settlement_hold';

export type SettlementSignalView = {
  key: 'offer' | 'inventory';
  tone: ActiveTradeDeliverySignalTone;
  label: string;
};

export type SettlementTransparencyView = {
  phase: SettlementTransparencyPhase;
  title: string;
  body: string;
  /** Seller: «Средства будут доступны: …»; buyer: payout-to-seller wording. */
  fundsLine: string | null;
  holdUntilIso: string | null;
  holdUntilLabel: string | null;
  signals: SettlementSignalView[] | null;
  tone: 'ok' | 'info' | 'warn';
};

const DEFAULT_HOLD_DAYS = 8;

export function formatSettlementHoldUntil(
  iso: string | null | undefined,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
  nowMs = Date.now(),
): string | null {
  if (!iso?.trim()) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const t = createExtensionT(locale);
  const formatted = date.toLocaleString(localeToBcp47(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  if (date.getTime() <= nowMs) {
    return t('settlement.soonSuffix', { formatted });
  }
  return formatted;
}

function signalLabel(
  key: 'offer' | 'inventory',
  tone: ActiveTradeDeliverySignalTone,
  locale: ExtensionLocale,
): string {
  const t = createExtensionT(locale);
  if (key === 'offer') {
    switch (tone) {
      case 'ok':
        return t('settlement.offerOk');
      case 'warn':
        return t('settlement.offerWarn');
      case 'pending':
        return t('settlement.offerPending');
      default:
        return t('settlement.offerUnknown');
    }
  }
  switch (tone) {
    case 'ok':
      return t('settlement.invOk');
    case 'warn':
      return t('settlement.invWarn');
    case 'pending':
      return t('settlement.invPending');
    default:
      return t('settlement.invUnknown');
  }
}

export function buildDeliverySignals(
  progress: ActiveTradeDeliveryProgress | null | undefined,
  locale: ExtensionLocale = DEFAULT_EXTENSION_LOCALE,
): SettlementSignalView[] | null {
  if (!progress) {
    return [
      {
        key: 'offer',
        tone: 'pending',
        label: signalLabel('offer', 'pending', locale),
      },
      {
        key: 'inventory',
        tone: 'pending',
        label: signalLabel('inventory', 'pending', locale),
      },
    ];
  }
  return [
    {
      key: 'offer',
      tone: progress.offerTone,
      label: signalLabel('offer', progress.offerTone, locale),
    },
    {
      key: 'inventory',
      tone: progress.inventoryTone,
      label: signalLabel('inventory', progress.inventoryTone, locale),
    },
  ];
}

/**
 * Calm post-accept tail for popup cards (TRADE_CONFIRMED / SETTLEMENT_HOLD).
 */
export function buildSettlementTransparency(
  trade: Pick<
    TradeVerificationResult,
    | 'role'
    | 'orderStatus'
    | 'settlementHoldUntil'
    | 'deliveryProgress'
    | 'amountMinor'
  >,
  opts?: {
    locale?: ExtensionLocale;
    nowMs?: number;
    holdDays?: number;
  },
): SettlementTransparencyView | null {
  const locale = opts?.locale ?? DEFAULT_EXTENSION_LOCALE;
  const nowMs = opts?.nowMs ?? Date.now();
  const holdDays = opts?.holdDays ?? DEFAULT_HOLD_DAYS;
  const t = createExtensionT(locale);

  if (trade.orderStatus === 'TRADE_CONFIRMED') {
    const signals = buildDeliverySignals(trade.deliveryProgress, locale);
    return {
      phase: 'delivery_verifying',
      title:
        trade.role === 'seller'
          ? t('settlement.deliveryTitleSeller')
          : t('settlement.deliveryTitleBuyer'),
      body:
        trade.role === 'seller'
          ? t('settlement.deliveryBodySeller')
          : t('settlement.deliveryBodyBuyer'),
      fundsLine: null,
      holdUntilIso: null,
      holdUntilLabel: null,
      signals,
      tone: signals?.some((row) => row.tone === 'warn') ? 'warn' : 'info',
    };
  }

  if (trade.orderStatus === 'SETTLEMENT_HOLD') {
    const holdUntilIso = trade.settlementHoldUntil?.trim() || null;
    const holdUntilLabel = formatSettlementHoldUntil(
      holdUntilIso,
      locale,
      nowMs,
    );
    const fundsLine =
      trade.role === 'seller'
        ? holdUntilLabel
          ? t('settlement.fundsSellerKnown', { date: holdUntilLabel })
          : t('settlement.fundsSellerUnknown', { days: holdDays })
        : holdUntilLabel
          ? t('settlement.fundsBuyerKnown', { date: holdUntilLabel })
          : t('settlement.fundsBuyerUnknown', { days: holdDays });

    return {
      phase: 'settlement_hold',
      title:
        trade.role === 'seller'
          ? t('settlement.holdTitleSeller')
          : t('settlement.holdTitleBuyer'),
      body:
        trade.role === 'seller'
          ? t('settlement.holdBodySeller')
          : t('settlement.holdBodyBuyer'),
      fundsLine,
      holdUntilIso,
      holdUntilLabel,
      signals: null,
      tone: 'ok',
    };
  }

  return null;
}

export function settlementTransparencyHtml(
  view: SettlementTransparencyView,
  escapeHtml: (value: string) => string,
): string {
  const signals =
    view.signals && view.signals.length > 0
      ? `<ul class="settlement-signals">${view.signals
          .map(
            (row) =>
              `<li class="settlement-signal tone-${escapeHtml(row.tone)}">${escapeHtml(row.label)}</li>`,
          )
          .join('')}</ul>`
      : '';
  const funds = view.fundsLine
    ? `<p class="settlement-funds">${escapeHtml(view.fundsLine)}</p>`
    : '';
  return `
    <div class="settlement-block tone-${escapeHtml(view.tone)}" data-settlement-phase="${escapeHtml(view.phase)}">
      <p class="settlement-title">${escapeHtml(view.title)}</p>
      ${funds}
      <p class="settlement-body">${escapeHtml(view.body)}</p>
      ${signals}
    </div>
  `;
}
