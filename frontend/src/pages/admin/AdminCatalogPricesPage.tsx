import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCatalogPriceRefreshStatus,
  refreshCatalogPrices,
} from '../../api/admin';
import type { CatalogPriceRefreshStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('ru-RU');
}

export function AdminCatalogPricesPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState<CatalogPriceRefreshStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) {
      return Promise.resolve();
    }
    return getCatalogPriceRefreshStatus(token)
      .then(setStatus)
      .catch((err: unknown) => setError(err));
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [token, load]);

  useEffect(() => {
    if (!token || status?.status !== 'running') {
      return;
    }
    const timer = window.setInterval(() => {
      void load();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [token, status?.status, load]);

  async function handleRefresh() {
    if (!token) {
      return;
    }
    setRefreshing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const next = await refreshCatalogPrices(token);
      setStatus(next);
      if (next.status === 'running') {
        setSuccessMessage('Обновление цен запущено в фоне.');
      }
    } catch (err) {
      setError(err);
    } finally {
      setRefreshing(false);
    }
  }

  const running = status?.status === 'running';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Цены каталога</h2>
          <p className="muted">
            Массовое обновление Steam-цен из снимка market.csgo.com. Автообновление: 1-е и
            15-е число месяца в 04:00.
          </p>
        </div>
        <div className="page-header-actions">
          <Link to="/admin/orders" className="button secondary">
            К заказам
          </Link>
          <button
            type="button"
            className="button"
            disabled={refreshing || running || !token}
            onClick={() => void handleRefresh()}
          >
            {running ? 'Обновление…' : 'Обновить цены'}
          </button>
        </div>
      </div>

      {error ? <ErrorAlert error={error} /> : null}
      {successMessage ? <p className="alert alert-success">{successMessage}</p> : null}

      <section className="card admin-card">
        <h3>Кэш SteamPriceCache</h3>
        <p className="muted small">
          Статус: {loading ? 'загрузка…' : status?.status ?? '—'}
        </p>

        <div className="admin-section">
          <p>
            <strong>Записей в кэше:</strong>{' '}
            {status?.cacheSummary?.cachedItems?.toLocaleString('ru-RU') ?? '—'}
          </p>
          <p>
            <strong>Последнее обновление:</strong>{' '}
            {formatDateTime(status?.cacheSummary?.latestFetchedAt)}
          </p>
          <p>
            <strong>Последний запуск:</strong>{' '}
            {status?.trigger ? `${status.trigger} · ` : ''}
            {formatDateTime(status?.finishedAt ?? status?.startedAt)}
          </p>
          {status?.result ? (
            <>
              <p>
                <strong>Сопоставлено:</strong> {status.result.matched.toLocaleString('ru-RU')} /{' '}
                {status.result.catalogTotal.toLocaleString('ru-RU')}
              </p>
              <p>
                <strong>Размер снимка:</strong>{' '}
                {status.result.snapshotSize.toLocaleString('ru-RU')}
              </p>
            </>
          ) : null}
          {status?.progress && running ? (
            <p>
              <strong>Прогресс:</strong> {status.progress.processed} /{' '}
              {status.progress.total || status.progress.matched}
            </p>
          ) : null}
          {status?.error ? (
            <p className="alert alert-error">
              <strong>Ошибка:</strong> {status.error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
