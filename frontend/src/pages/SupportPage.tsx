import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createSupportTicket, listMySupportTickets } from '../api/marketplace';
import type { SupportTicket } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { PageHeader } from '../components/PageHeader';
import { SUPPORT_FAQ_ARTICLES } from '../data/support-faq';
import { SUPPORT_EMAIL } from '../utils/format';

export function SupportPage() {
  const { token } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const ticket = await createSupportTicket(token, {
        subject: subject.trim(),
        body: body.trim(),
      });
      setTickets((current) => [ticket, ...current]);
      setSubject('');
      setBody('');
      setSuccess('Тикет создан. Команда поддержки ответит в этом разделе.');
    } catch (err: unknown) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page support-page">
      <PageHeader
        title="Поддержка"
        subtitle="FAQ, типичные ошибки и тикеты для команды R.I.P. Market."
      />

      <div className="support-page-grid">
        <section className="card support-faq-section" data-testid="support-faq-section">
          <h2 className="support-section-title">Частые вопросы</h2>
          <div className="support-faq-list">
            {SUPPORT_FAQ_ARTICLES.map((article) => (
              <details key={article.id} className="support-faq-item">
                <summary>{article.title}</summary>
                <p className="muted small">{article.body}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="card support-ticket-section" data-testid="support-page">
          <h2 className="support-section-title">Создать тикет</h2>
          <p className="muted small">
            Укажите ID сделки и опишите проблему. Email для связи:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} data-testid="support-email-link">
              {SUPPORT_EMAIL}
            </a>
          </p>

          {!token ? (
            <p className="muted">
              <Link to="/login?returnUrl=%2Fsupport">Войдите</Link>, чтобы создать тикет.
            </p>
          ) : (
            <form className="support-ticket-form" onSubmit={(event) => void handleSubmit(event)}>
              <label className="field">
                <span className="field-label">Тема</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Проблема с обменом / выплатой"
                  data-testid="support-ticket-subject"
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Описание</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={5}
                  placeholder="ID сделки, что произошло, скриншоты ошибки…"
                  data-testid="support-ticket-body"
                  required
                />
              </label>
              <ErrorAlert error={error} />
              {success ? <p className="success-text">{success}</p> : null}
              <button
                type="submit"
                className="button primary"
                disabled={loading}
                data-testid="support-ticket-submit"
              >
                {loading ? 'Отправка…' : 'Отправить тикет'}
              </button>
            </form>
          )}

          {token && tickets.length > 0 ? (
            <div className="support-ticket-list" data-testid="support-ticket-list">
              <h3 className="support-subsection-title">Мои тикеты</h3>
              {tickets.map((ticket) => (
                <article key={ticket.id} className="support-ticket-card" data-testid={`support-ticket-${ticket.id}`}>
                  <div className="support-ticket-card-header">
                    <strong>{ticket.subject}</strong>
                    <span className="muted small">{ticket.status === 'OPEN' ? 'Открыт' : 'Решён'}</span>
                  </div>
                  <p className="muted small">{ticket.body}</p>
                  {ticket.adminReply ? (
                    <p className="support-ticket-reply" data-testid="support-ticket-reply">
                      <strong>Ответ поддержки:</strong> {ticket.adminReply}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
