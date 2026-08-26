import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createSupportTicket, listMySupportTickets } from '../api/marketplace';
import type { SupportTicket } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { ErrorAlert } from '../components/ErrorAlert';
import { PageHeader } from '../components/PageHeader';
import { SteamLoginButton } from '../components/SteamLoginButton';
import { ThemeSelect } from '../components/ThemeSelect';
import {
  SUPPORT_TICKET_TOPIC_IDS,
  supportTicketTopicHint,
  supportTicketTopicLabel,
  type SupportTicketTopicId,
} from '../data/support-ticket-topics';
import { SUPPORT_EMAIL } from '../utils/format';
import {
  formatTradeEscalationTicketBody,
  parseSupportEscalationFromSearch,
  readTradeEscalationPack,
  type TradeEscalationPack,
} from '../utils/trade-timeout-escalation';
import {
  formatSupportBridgeTicketBody,
  parseSupportBridgeFromSearch,
  type SupportBridgePack,
} from '../utils/support-bridge-pack';

function buildTicketBody(
  dealId: string,
  body: string,
  offerId?: string,
  pack?: TradeEscalationPack | null,
  bridge?: SupportBridgePack | null,
): string {
  const trimmedBody = body.trim();
  if (bridge) {
    if (trimmedBody.includes('--- R.I.P extension support ---')) {
      return trimmedBody;
    }
    return formatSupportBridgeTicketBody(bridge);
  }
  if (pack) {
    // Body may already include the pack template — avoid double-wrapping.
    if (trimmedBody.includes('--- R.I.P trade escalation ---')) {
      return trimmedBody;
    }
    return formatTradeEscalationTicketBody(pack, trimmedBody);
  }

  const trimmedDeal = dealId.trim();
  const trimmedOffer = offerId?.trim() || '';
  const header: string[] = [];
  if (trimmedDeal) {
    header.push(`Deal ID: ${trimmedDeal}`);
  }
  if (trimmedOffer) {
    header.push(`Offer ID: ${trimmedOffer}`);
  }
  if (header.length === 0) {
    return trimmedBody;
  }
  return `${header.join('\n')}\n\n${trimmedBody}`;
}

export function SupportPage() {
  const { locale, t } = useLocale();
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [topicId, setTopicId] = useState<SupportTicketTopicId | ''>('');
  const [dealId, setDealId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [body, setBody] = useState('');
  const [escalationPrefill, setEscalationPrefill] = useState(false);
  const [escalationPack, setEscalationPack] = useState<TradeEscalationPack | null>(
    null,
  );
  const [supportBridgePack, setSupportBridgePack] =
    useState<SupportBridgePack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const topicOptions = useMemo(
    () =>
      SUPPORT_TICKET_TOPIC_IDS.map((id) => ({
        value: id,
        label: supportTicketTopicLabel(id, locale),
      })),
    [locale],
  );

  const subject = useMemo(
    () => (topicId ? supportTicketTopicLabel(topicId, locale) : ''),
    [topicId, locale],
  );

  const topicHint = topicId ? supportTicketTopicHint(topicId, locale) : null;

  useEffect(() => {
    const parsed = parseSupportEscalationFromSearch(searchParams);
    if (parsed.dealId) {
      setDealId(parsed.dealId);
    }
    if (parsed.offerId) {
      setOfferId(parsed.offerId);
    }
    if (parsed.topic) {
      setTopicId(parsed.topic);
    }

    const bridge = parseSupportBridgeFromSearch(searchParams);
    if (bridge) {
      setSupportBridgePack(bridge);
      setEscalationPrefill(true);
      setEscalationPack(null);
      if (!parsed.topic) {
        setTopicId('extension');
      }
      if (!parsed.dealId && bridge.primaryOrderId) {
        setDealId(bridge.primaryOrderId);
      }
      const primaryOffer = bridge.deals.find(
        (deal) => deal.orderId === bridge.primaryOrderId,
      )?.offerId;
      if (!parsed.offerId && primaryOffer) {
        setOfferId(primaryOffer);
      }
      setBody(formatSupportBridgeTicketBody(bridge));
      return;
    }

    setSupportBridgePack(null);
    const packFromStorage = parsed.dealId
      ? readTradeEscalationPack(parsed.dealId)
      : null;
    const packFromEvidence = parsed.evidence;
    const pack = packFromStorage ?? packFromEvidence;
    if (pack || parsed.reason) {
      setEscalationPrefill(true);
      const effectivePack: TradeEscalationPack =
        pack ??
        ({
          version: 1,
          reason: parsed.reason ?? 'trade_problem',
          orderId: parsed.dealId,
          offerId: parsed.offerId || null,
          orderStatus: 'UNKNOWN',
          role: 'other',
          verificationStatus: parsed.verifyStatus || null,
          failedCheckKeys: parsed.failedChecks,
          nextActionKind: parsed.nextAction || null,
          remainingMinutes: null,
          tradeTimeoutAt: null,
          capturedAt: parsed.capturedAt || new Date().toISOString(),
        } satisfies TradeEscalationPack);
      setEscalationPack(effectivePack);
      setBody(formatTradeEscalationTicketBody(effectivePack));
      if (!parsed.offerId && effectivePack.offerId) {
        setOfferId(effectivePack.offerId);
      }
    } else {
      setEscalationPack(null);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      return;
    }
    listMySupportTickets(token)
      .then(setTickets)
      .catch(() => undefined);
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !subject) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const pack =
        escalationPack ?? (dealId ? readTradeEscalationPack(dealId) : null);
      const ticket = await createSupportTicket(token, {
        subject,
        body: buildTicketBody(dealId, body, offerId, pack, supportBridgePack),
      });
      setTickets((current) => [ticket, ...current]);
      setTopicId('');
      setDealId('');
      setOfferId('');
      setBody('');
      setEscalationPrefill(false);
      setEscalationPack(null);
      setSupportBridgePack(null);
      setSuccess(t('support.success'));
    } catch (err: unknown) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page support-page">
      <PageHeader title={t('support.title')} subtitle={t('support.subtitle')} />

      <section className="card support-trust-strip" data-testid="support-trust-strip">
        <div className="support-trust-copy">
          <h2 className="support-trust-title">{t('support.trustTitle')}</h2>
          <p className="muted small">{t('support.trustBody')}</p>
        </div>
        <div className="support-trust-actions">
          <Link to="/faq" className="button secondary sm" data-testid="support-faq-link">
            {t('support.openFaq')}
          </Link>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="button ghost sm"
            data-testid="support-email-link"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
      </section>

      <section
        id="support-tickets"
        className="card support-ticket-section"
        data-testid="support-page"
      >
        <h2 className="support-section-title">{t('support.createTicket')}</h2>
        <p className="muted small support-form-lead">{t('support.formHint')}</p>

        {!token ? (
          <div className="support-login-gate" data-testid="support-login-gate">
            <p className="support-login-gate-title">{t('support.loginRequiredTitle')}</p>
            <p className="muted small">{t('support.loginRequired')}</p>
            <SteamLoginButton
              returnPath="/support"
              size="md"
              testId="support-steam-login"
              label={t('auth.steamLogin')}
            />
          </div>
        ) : (
          <form className="support-ticket-form" onSubmit={(event) => void handleSubmit(event)}>
            {escalationPrefill ? (
              <p
                className="alert alert-info"
                data-testid="support-escalation-prefill"
              >
                {supportBridgePack
                  ? t('support.bridgePrefillHint')
                  : t('tradeEscalation.prefillHint')}
              </p>
            ) : null}

            <label className="field">
              <span className="field-label">{t('support.topicLabel')}</span>
              <ThemeSelect
                value={topicId}
                options={topicOptions}
                placeholder={t('support.topicPlaceholder')}
                required
                data-testid="support-ticket-subject"
                onChange={(value) => setTopicId(value as SupportTicketTopicId | '')}
              />
            </label>

            {topicHint ? (
              <p className="support-topic-hint muted small" data-testid="support-topic-hint">
                {topicHint}
              </p>
            ) : null}

            <label className="field">
              <span className="field-label">{t('support.dealIdLabel')}</span>
              <input
                type="text"
                value={dealId}
                onChange={(event) => setDealId(event.target.value)}
                placeholder={t('support.dealIdPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                data-testid="support-ticket-deal-id"
              />
              <span className="field-hint muted small">{t('support.dealIdHint')}</span>
            </label>

            <label className="field">
              <span className="field-label">{t('support.offerIdLabel')}</span>
              <input
                type="text"
                value={offerId}
                onChange={(event) => setOfferId(event.target.value)}
                placeholder={t('support.offerIdPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                data-testid="support-ticket-offer-id"
              />
            </label>

            <label className="field">
              <span className="field-label">{t('support.bodyLabel')}</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={escalationPrefill ? 12 : 5}
                placeholder={t('support.bodyPlaceholder')}
                data-testid="support-ticket-body"
                required
                minLength={10}
              />
            </label>

            <p className="muted small support-attachment-hint" data-testid="support-attachment-hint">
              {t('support.attachmentHint')}
            </p>

            <ErrorAlert error={error} />
            {success ? (
              <p className="success-text" data-testid="support-ticket-success">
                {success}
              </p>
            ) : null}
            <button
              type="submit"
              className="button primary"
              disabled={loading || !subject}
              data-testid="support-ticket-submit"
            >
              {loading ? t('support.submitting') : t('support.submit')}
            </button>
          </form>
        )}

        {token && tickets.length > 0 ? (
          <div className="support-ticket-list" data-testid="support-ticket-list">
            <h3 className="support-subsection-title">{t('support.myTickets')}</h3>
            {tickets.map((ticket) => (
              <article
                key={ticket.id}
                className="support-ticket-card"
                data-testid={`support-ticket-${ticket.id}`}
              >
                <div className="support-ticket-card-header">
                  <strong>{ticket.subject}</strong>
                  <span
                    className={`support-ticket-status${
                      ticket.status === 'OPEN' ? ' is-open' : ' is-resolved'
                    }`}
                  >
                    {ticket.status === 'OPEN'
                      ? t('support.statusOpen')
                      : t('support.statusResolved')}
                  </span>
                </div>
                <p className="muted small support-ticket-body-preview">{ticket.body}</p>
                {ticket.adminReply ? (
                  <p className="support-ticket-reply" data-testid="support-ticket-reply">
                    <strong>{t('support.adminReply')}</strong> {ticket.adminReply}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
