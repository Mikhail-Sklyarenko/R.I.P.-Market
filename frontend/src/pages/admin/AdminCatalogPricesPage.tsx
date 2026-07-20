import { useCallback, useEffect, useState } from 'react';
import {
  getCatalogPriceRefreshStatus,
  refreshCatalogPrices,
  stopCatalogPriceRefresh,
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
  const [stopping, setStopping] = useState(false);
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
        setSuccessMessage(
          'Прогон Steam запущен в фоне (обычно 3–5 часов). Старые цены остаются на сайте.',
        );
      }
    } catch (err) {
      setError(err);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStop() {
    if (!token) {
      return;
    }
    setStopping(true);
    setError(null);
    try {
      const next = await stopCatalogPriceRefresh(token);
      setStatus(next);
      setSuccessMessage('Остановка запрошена — текущий предмет завершится, затем прогон остановится.');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setStopping(false);
    }
  }

  const running = status?.status === 'running';
  const progress = status?.progress;
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : null;

  return (
    <div className="page">
      <PageHeader
        title="Цены каталога"
        subtitle="Прямые запросы Steam Market → кэш на 2–3 недели. Авто: 1-е и 15-е число в 04:00. Без market.csgo.com."
        actions={
          <div className="stack horizontal">
            {running ? (
              <button
                type="button"
                className="button secondary"
                disabled={stopping || !token}
                onClick={() => void handleStop()}
              >
                {stopping ? 'Остановка…' : 'Остановить'}
              </button>
            ) : null}
            <button
              type="button"
              className="button primary"
              disabled={refreshing || running || !token}
              onClick={() => void handleRefresh()}
            >
              {running ? 'Прогон Steam…' : 'Обновить из Steam'}
            </button>
          </div>
        }
      />

      {error ? <ErrorAlert error={error} /> : null}
      {successMessage ? <p className="alert alert-success">{successMessage}</p> : null}

      {loading ? <LoadingState message="Загрузка статуса…" /> : null}

      {!loading ? (
        <section className="card">
          <p className="eyebrow">Steam Market → SteamPriceCache</p>
          <h3>Статус: {status?.status ?? '—'}</h3>
          <p className="muted small">
            {status?.estimatedDurationHint ?? 'Полный прогон обычно занимает 3–5 часов.'}
          </p>

          {running && percent != null ? (
            <p className="muted">
              Прогресс: <strong>{percent}%</strong>
            </p>
          ) : null}

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
            <div>
              <dt>Источник</dt>
              <dd>{status?.source ?? 'steam'}</dd>
            </div>
            {status?.result ? (
              <>
                <div>
                  <dt>С ценой / всего</dt>
                  <dd>
                    {status.result.matched.toLocaleString('ru-RU')} /{' '}
                    {status.result.catalogTotal.toLocaleString('ru-RU')}
                  </dd>
                </div>
                <div>
                  <dt>Без цены (Steam)</dt>
                  <dd>{status.result.failed.toLocaleString('ru-RU')}</dd>
                </div>
                <div>
                  <dt>Запросов к Steam</dt>
                  <dd>{status.result.steamRequests.toLocaleString('ru-RU')}</dd>
                </div>
              </>
            ) : null}
            {progress && running ? (
              <>
                <div>
                  <dt>Обработано</dt>
                  <dd>
                    {progress.processed.toLocaleString('ru-RU')} /{' '}
                    {progress.total.toLocaleString('ru-RU')}
                  </dd>
                </div>
                <div>
                  <dt>Найдено / пусто</dt>
                  <dd>
                    {progress.matched.toLocaleString('ru-RU')} /{' '}
                    {progress.failed.toLocaleString('ru-RU')}
                  </dd>
                </div>
              </>
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
