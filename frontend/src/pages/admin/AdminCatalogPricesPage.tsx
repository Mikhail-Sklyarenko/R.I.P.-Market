import { useCallback, useEffect, useState } from 'react';
import {
  getCatalogPriceRefreshStatus,
  refreshCatalogPrices,
} from '../../api/admin';
import type { CatalogPriceRefreshStatus } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorAlert } from '../../components/ErrorAlert';
import { LoadingState } from '../../components/LoadingState';
import { PageHeader } from '../../components/PageHeader';

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
      <PageHeader
        title="Цены каталога"
        subtitle="Массовое обновление Steam-цен из снимка market.csgo.com. Авто: 1-е и 15-е число в 04:00."
        actions={
          <button
            type="button"
            className="button primary"
            disabled={refreshing || running || !token}
            onClick={() => void handleRefresh()}
          >
            {running ? 'Обновление…' : 'Обновить цены'}
          </button>
        }
      />

      {error ? <ErrorAlert error={error} /> : null}
      {successMessage ? <p className="alert alert-success">{successMessage}</p> : null}

      {loading ? <LoadingState message="Загрузка статуса…" /> : null}

      {!loading ? (
        <section className="card">
          <p className="eyebrow">SteamPriceCache</p>
          <h3 className="page-header-title" style={{ fontSize: 'var(--font-size-lg)' }}>
            Статус: {status?.status ?? '—'}
          </h3>
          <dl className="meta-list">
            <div>
              <dt>Записей в кэше</dt>
              <dd>{status?.cacheSummary?.cachedItems?.toLocaleString('ru-RU') ?? '—'}</dd>
            </div>
            <div>
              <dt>Последнее обновление</dt>
              <dd>{formatDateTime(status?.cacheSummary?.latestFetchedAt)}</dd>
            </div>
            <div>
              <dt>Последний запуск</dt>
              <dd>
                {status?.trigger ? `${status.trigger} · ` : ''}
                {formatDateTime(status?.finishedAt ?? status?.startedAt)}
              </dd>
            </div>
            {status?.result ? (
              <>
                <div>
                  <dt>Сопоставлено</dt>
                  <dd>
                    {status.result.matched.toLocaleString('ru-RU')} /{' '}
                    {status.result.catalogTotal.toLocaleString('ru-RU')}
                  </dd>
                </div>
                <div>
                  <dt>Размер снимка</dt>
                  <dd>{status.result.snapshotSize.toLocaleString('ru-RU')}</dd>
                </div>
              </>
            ) : null}
            {status?.progress && running ? (
              <div>
                <dt>Прогресс</dt>
                <dd>
                  {status.progress.processed} /{' '}
                  {status.progress.total || status.progress.matched}
                </dd>
              </div>
            ) : null}
          </dl>
          {status?.error ? (
            <p className="alert alert-error">
              <strong>Ошибка:</strong> {status.error}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
