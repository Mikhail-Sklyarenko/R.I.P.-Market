import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createSupportTicket, listMySupportTickets } from '../api/marketplace';
import type { SupportTicket } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { ErrorAlert } from '../components/ErrorAlert';
import { PageHeader } from '../components/PageHeader';
import { ThemeSelect } from '../components/ThemeSelect';
import {
  SUPPORT_TICKET_TOPIC_IDS,
  supportTicketTopicLabel,
  type SupportTicketTopicId,
} from '../data/support-ticket-topics';
import { SUPPORT_EMAIL } from '../utils/format';

export function SupportPage() {
  const { locale, t } = useLocale();
  const { token } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [topicId, setTopicId] = useState<SupportTicketTopicId | ''>('');
  const [body, setBody] = useState('');
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
      const ticket = await createSupportTicket(token, {
        subject,
        body: body.trim(),
      });
      setTickets((current) => [ticket, ...current]);
      setTopicId('');
      setBody('');
      setSuccess(t('support.success'));
    } catch (err: unknown) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page support-page">
      <PageHeader
        title={t('support.title')}
        subtitle={t('support.subtitle')}
      />

      <p className="muted small support-page-faq-link">
        <Link to="/faq" data-testid="support-faq-link">
          {t('support.openFaq')}
        </Link>
      </p>

      <section
        id="support-tickets"
        className="card support-ticket-section"
        data-testid="support-page"
      >
        <h2 className="support-section-title">{t('support.createTicket')}</h2>
        <p className="muted small">
          {t('support.formHint')}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} data-testid="support-email-link">
            {SUPPORT_EMAIL}
          </a>
        </p>

        {!token ? (
          <p className="muted">{t('support.loginRequired')}</p>
        ) : (
          <form className="support-ticket-form" onSubmit={(event) => void handleSubmit(event)}>
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
            <label className="field">
              <span className="field-label">{t('support.bodyLabel')}</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                placeholder={t('support.bodyPlaceholder')}
                data-testid="support-ticket-body"
                required
                minLength={10}
              />
            </label>
            <ErrorAlert error={error} />
            {success ? <p className="success-text">{success}</p> : null}
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
                  <span className="muted small">
                    {ticket.status === 'OPEN'
                      ? t('support.statusOpen')
                      : t('support.statusResolved')}
                  </span>
                </div>
                <p className="muted small">{ticket.body}</p>
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
