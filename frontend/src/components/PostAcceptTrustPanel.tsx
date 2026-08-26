import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import type { Order } from '../api/types';
import {
  formatSettlementHoldUntil,
  resolvePostAcceptTrust,
  type DualSignalTone,
} from '../utils/post-accept-trust';

type PostAcceptTrustPanelProps = {
  order: Order;
  role: 'buyer' | 'seller' | 'other';
};

function toneLabel(tone: DualSignalTone, t: (key: string) => string): string {
  switch (tone) {
    case 'ok':
      return t('postAcceptTrust.toneOk');
    case 'warn':
      return t('postAcceptTrust.toneWarn');
    case 'pending':
      return t('postAcceptTrust.tonePending');
    default:
      return t('postAcceptTrust.toneUnknown');
  }
}

export function PostAcceptTrustPanel({ order, role }: PostAcceptTrustPanelProps) {
  const { t, locale } = useLocale();
  const view = resolvePostAcceptTrust({ order, role });
  if (!view) {
    return null;
  }

  const holdLabel = formatSettlementHoldUntil(view.holdUntil, locale);

  return (
    <section
      className={`post-accept-trust post-accept-trust--${view.phase}`}
      data-testid="post-accept-trust"
      data-phase={view.phase}
    >
      <p className="eyebrow">{t('postAcceptTrust.eyebrow')}</p>
      <strong className="post-accept-trust-title">{t(view.titleKey)}</strong>
      <p className="muted small">{t(view.bodyKey)}</p>
      <p className="post-accept-trust-reason">{t(view.reasonKey)}</p>

      {view.dualSignals ? (
        <ul className="post-accept-trust-signals" data-testid="post-accept-dual-signals">
          {view.dualSignals.map((signal) => (
            <li
              key={signal.key}
              className={`post-accept-trust-signal tone-${signal.tone}`}
              data-signal={signal.key}
              data-tone={signal.tone}
            >
              <span>{t(signal.labelKey)}</span>
              <strong>{toneLabel(signal.tone, t)}</strong>
            </li>
          ))}
        </ul>
      ) : null}

      {view.phase === 'settlement_hold' && holdLabel ? (
        <p className="post-accept-trust-until" data-testid="post-accept-hold-until">
          {t('postAcceptTrust.holdUntilLabel')}: <strong>{holdLabel}</strong>
        </p>
      ) : null}

      <p className="muted small post-accept-trust-support">
        <Link to={`/support?dealId=${encodeURIComponent(order.id)}`}>
          {t('orderPage.supportLink')}
        </Link>
      </p>
    </section>
  );
}
