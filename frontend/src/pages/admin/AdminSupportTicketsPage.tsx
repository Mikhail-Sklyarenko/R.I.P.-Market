import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminSupportTickets, replyAdminSupportTicket } from '../../api/admin';
import type { AdminSupportTicket } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState } from '../../components/EmptyState';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function userLabel(ticket: AdminSupportTicket): string {
  return ticket.user.steamId
    ? `${ticket.user.username} (${ticket.user.steamId})`
    : ticket.user.username;
}

export function AdminSupportTicketsPage() {
  const { token } = useAuth();
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) {
      return Promise.resolve();
    }
    return getAdminSupportTickets(token)
      .then(setTickets)
      .catch((err: unknown) => setError(err));
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [token, load]);

  const openCount = useMemo(() => tickets.length, [tickets]);

  async function handleReply(event: FormEvent, ticketId: string) {
    event.preventDefault();
    if (!token) {
      return;
    }
    const adminReply = replyDrafts[ticketId]?.trim();
    if (!adminReply) {
      return;
    }

    setSubmittingId(ticketId);
    setError(null);
    setSuccessMessage(null);
    try {
      await replyAdminSupportTicket(token, ticketId, adminReply);
      setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
      setReplyDrafts((current) => {
        const next = { ...current };
        delete next[ticketId];
        return next;
      });
      setSuccessMessage('Ответ отправлен, тикет закрыт.');
    } catch (err: unknown) {
      setError(err);
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="page" data-testid="admin-support-tickets-page">
      <PageHeader
        title="Тикеты поддержки"
        subtitle="Открытые обращения пользователей."
      />

      {!loading ? (
        <div className="deals-summary-grid" data-testid="admin-support-summary">
          <div className="card seller-summary-card">
            <span className="eyebrow">Открытых</span>
            <strong className="seller-summary-count">{openCount}</strong>
          </div>
        </div>
      ) : null}

      {successMessage ? (
        <p className="alert alert-success" data-testid="admin-support-success">
          {successMessage}
        </p>
      ) : null}

      <ErrorAlert error={error} />

      {loading ? <LoadingState message="Загрузка тикетов…" /> : null}

      {!loading && tickets.length === 0 ? (
        <EmptyState
          title="Открытых тикетов нет"
          message="Новые обращения появятся здесь после отправки с страницы поддержки."
        />
      ) : null}

      {!loading && tickets.length > 0 ? (
        <div className="admin-support-ticket-list" data-testid="admin-support-tickets-list">
          {tickets.map((ticket) => (
            <article
              key={ticket.id}
              className="card support-ticket-card admin-support-ticket-card"
              data-testid={`admin-support-ticket-${ticket.id}`}
            >
              <div className="support-ticket-card-header">
                <div>
                  <strong>{ticket.subject}</strong>
                  <p className="muted small admin-support-ticket-meta">
                    {formatDateTime(ticket.createdAt)} ·{' '}
                    <Link to="/admin/users">{userLabel(ticket)}</Link>
                  </p>
                </div>
                <span className="badge badge-active">OPEN</span>
              </div>

              <p className="admin-support-ticket-body">{ticket.body}</p>

              <form
                className="support-ticket-form admin-support-reply-form"
                onSubmit={(event) => void handleReply(event, ticket.id)}
              >
                <label className="field">
                  <span className="field-label">Ответ пользователю</span>
                  <textarea
                    value={replyDrafts[ticket.id] ?? ''}
                    onChange={(event) =>
                      setReplyDrafts((current) => ({
                        ...current,
                        [ticket.id]: event.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="Напишите ответ — тикет будет закрыт после отправки."
                    data-testid={`admin-support-ticket-reply-${ticket.id}`}
                    required
                    minLength={1}
                  />
                </label>
                <button
                  type="submit"
                  className="button primary sm"
                  disabled={submittingId === ticket.id || !(replyDrafts[ticket.id]?.trim())}
                  data-testid={`admin-support-ticket-submit-${ticket.id}`}
                >
                  {submittingId === ticket.id ? 'Отправка…' : 'Ответить и закрыть'}
                </button>
              </form>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
