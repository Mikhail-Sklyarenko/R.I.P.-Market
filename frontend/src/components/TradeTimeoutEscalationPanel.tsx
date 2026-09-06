import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import type { Order } from '../api/types';
import {
  buildTradeProblemSupportPath,
  resolveTradeTimeoutView,
  shouldShowTradeTimeout,
  type TradeEscalationReason,
  type TradeTimeoutUrgency,
} from '../utils/trade-timeout-escalation';

type TradeTimeoutEscalationPanelProps = {
  order: Order;
  role: 'buyer' | 'seller' | 'other';
  timeoutMinutes: number;
  remainingMinutes: number | null;
  nowMs?: number;
  /** Compact: one time line + quiet problem link (default full urgency card). */
  compact?: boolean;
};

function urgencyMessageKey(urgency: TradeTimeoutUrgency): string {
  switch (urgency) {
    case 'expired':
      return 'tradeEscalation.timeoutExpired';
    case 'critical':
      return 'tradeEscalation.timeoutCritical';
    case 'soon':
      return 'tradeEscalation.timeoutSoon';
    default:
      return 'tradeEscalation.timeoutOk';
  }
}

function resolveEscalationReason(
  order: Order,
  urgency: TradeTimeoutUrgency,
): TradeEscalationReason {
  if (order.tradeVerification?.status === 'mismatch') {
    return 'mismatch';
  }
  if (urgency === 'expired' || order.status === 'DISPUTE') {
    return 'timeout';
  }
  return 'trade_problem';
}

/**
 * C5: plain-language countdown to auto-dispute + «Проблема с обменом».
 */
export function TradeTimeoutEscalationPanel({
  order,
  role,
  timeoutMinutes,
  remainingMinutes,
  nowMs,
  compact = false,
}: TradeTimeoutEscalationPanelProps) {
  const { t } = useLocale();

  if (!shouldShowTradeTimeout(order.status)) {
    return null;
  }

  const view = resolveTradeTimeoutView({
    orderCreatedAt: order.createdAt,
    timeoutMinutes,
    nowMs,
  });
  if (!view) {
    return null;
  }

  const minutes =
    remainingMinutes !== null ? remainingMinutes : view.remainingMinutes;
  const reason = resolveEscalationReason(order, view.urgency);
  const supportPath = buildTradeProblemSupportPath({
    order,
    role,
    reason,
    remainingMinutes: minutes,
  });

  const timeLabel =
    view.urgency === 'expired'
      ? t('tradeEscalation.timeExpiredLabel')
      : view.hours > 0
        ? t('tradeEscalation.timeLeftHours', {
            hours: view.hours,
            minutes: view.minutesPart,
          })
        : t('tradeEscalation.timeLeftMinutes', { minutes });

  const persistSupport = () => {
    buildTradeProblemSupportPath(
      {
        order,
        role,
        reason,
        remainingMinutes: minutes,
      },
      { persist: true },
    );
  };

  if (compact) {
    return (
      <div
        className="trade-escalation trade-escalation--compact"
        data-testid="trade-timeout-escalation"
        data-urgency={view.urgency}
        data-compact="true"
      >
        <span className="muted small" data-testid="trade-timeout-label">
          {timeLabel}
        </span>
        <Link
          className="link-quiet"
          to={supportPath}
          data-testid="trade-problem-cta"
          onClick={persistSupport}
        >
          {t('tradeEscalation.problemCta')}
        </Link>
      </div>
    );
  }

  return (
    <section
      className={`trade-escalation trade-escalation--${view.urgency}`}
      data-testid="trade-timeout-escalation"
      data-urgency={view.urgency}
    >
      <p className="eyebrow">{t('tradeEscalation.eyebrow')}</p>
      <strong className="trade-escalation-time" data-testid="trade-timeout-label">
        {timeLabel}
      </strong>
      <p className="muted small" data-testid="trade-timeout-copy">
        {t(urgencyMessageKey(view.urgency), { minutes })}
      </p>
      <Link
        className="button secondary"
        to={supportPath}
        data-testid="trade-problem-cta"
        onClick={persistSupport}
      >
        {t('tradeEscalation.problemCta')}
      </Link>
    </section>
  );
}
