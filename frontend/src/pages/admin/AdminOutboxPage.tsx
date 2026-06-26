import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOutboxEvents, processOutbox, retryOutboxEvent } from '../../api/admin';
import type { OutboxEvent } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';

const STATUS_FILTERS = ['DEAD', 'PENDING', 'PROCESSED', ''] as const;

export function AdminOutboxPage() {
  const { token } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('DEAD');
  const [events, setEvents] = useState<OutboxEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    if (!token) {
      return Promise.resolve();
    }
    return getOutboxEvents(token, statusFilter || undefined)
      .then(setEvents)
      .catch((err: unknown) => setError(err));
  }, [token, statusFilter]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [token, load]);

  async function handleRetry(eventId: string) {
    if (!token) {
      return;
    }
    setRetryingId(eventId);
    setError(null);
    setSuccessMessage(null);
    try {
      await retryOutboxEvent(token, eventId);
      setSuccessMessage('Outbox event queued for retry.');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setRetryingId(null);
    }
  }

  async function handleProcess() {
    if (!token) {
      return;
    }
    setProcessing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await processOutbox(token);
      setSuccessMessage(`Processed ${result.processed}, failed ${result.failed}.`);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Outbox</h2>
          <p className="muted">Failed or stuck notification events.</p>
        </div>
        <Link to="/admin/orders" className="button secondary">
          Orders
        </Link>
      </div>

      <div className="segmented segmented-4">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status || 'all'}
            type="button"
            className={statusFilter === status ? 'segment active' : 'segment'}
            onClick={() => setStatusFilter(status)}
            data-testid={`outbox-filter-${status || 'all'}`}
          >
            {status || 'All'}
          </button>
        ))}
      </div>

      <div className="page-header">
        <p className="muted">{loading ? 'Loading…' : `${events.length} event(s)`}</p>
        <button
          type="button"
          className="button primary"
          disabled={processing}
          data-testid="outbox-process-pending"
          onClick={() => void handleProcess()}
        >
          {processing ? 'Processing…' : 'Process pending'}
        </button>
      </div>

      {successMessage ? (
        <p className="success-text" data-testid="outbox-success-message">
          {successMessage}
        </p>
      ) : null}

      <ErrorAlert error={error} />

      <div className="table-wrap">
        <table className="data-table" data-testid="admin-outbox-list">
          <thead>
            <tr>
              <th>Event</th>
              <th>Aggregate</th>
              <th>Status</th>
              <th>Retries</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} data-testid={`outbox-row-${event.status}`}>
                <td>{event.eventType}</td>
                <td>
                  {event.aggregateType}:{event.aggregateId.slice(0, 8)}…
                </td>
                <td>{event.status}</td>
                <td>{event.retryCount}</td>
                <td>
                  {event.status === 'DEAD' || event.status === 'PENDING' ? (
                    <button
                      type="button"
                      className="link-button"
                      disabled={retryingId === event.id}
                      data-testid={`outbox-retry-${event.id}`}
                      onClick={() => void handleRetry(event.id)}
                    >
                      {retryingId === event.id ? 'Retrying…' : 'Retry'}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
