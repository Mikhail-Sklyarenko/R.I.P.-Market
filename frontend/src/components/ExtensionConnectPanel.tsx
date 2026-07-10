import { useCallback, useEffect, useState } from 'react';
import {
  disconnectExtension,
  getExtensionRuntimeStatus,
  isExtensionRuntimeAvailable,
  pairExtension,
  type ExtensionRuntimeStatus,
} from '../utils/extension';

type ExtensionConnectPanelProps = {
  token: string;
  compact?: boolean;
};

export function ExtensionConnectPanel({ token, compact = false }: ExtensionConnectPanelProps) {
  const [status, setStatus] = useState<ExtensionRuntimeStatus>({ connected: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runtimeAvailable = isExtensionRuntimeAvailable();

  const refresh = useCallback(async () => {
    const next = await getExtensionRuntimeStatus();
    setStatus(next);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const result = await pairExtension(token);
    setLoading(false);
    if (result.ok) {
      setMessage('Расширение подключено. Сделки будут обрабатываться автоматически.');
      await refresh();
      return;
    }
    setError(result.error);
  }

  async function handleDisconnect() {
    setLoading(true);
    await disconnectExtension();
    setLoading(false);
    setMessage(null);
    await refresh();
  }

  if (!runtimeAvailable) {
    return (
      <div className="card extension-panel" data-testid="extension-install-hint">
        <h3 className="extension-panel-title">Расширение для автообмена</h3>
        <p className="muted small">
          Установите расширение R.I.P Market (папка <code>browser-extension/dist</code> в
          Chrome → Расширения → Режим разработчика) и укажите{' '}
          <code>VITE_EXTENSION_ID</code> во frontend <code>.env</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="card extension-panel" data-testid="extension-connect-panel">
      <h3 className="extension-panel-title">
        {compact ? 'Расширение' : 'Расширение для автообмена'}
      </h3>
      <p className="muted small" data-testid="extension-connection-status">
        {status.connected
          ? `Подключено${status.expiresAt ? ` до ${new Date(status.expiresAt).toLocaleTimeString()}` : ''}`
          : 'Не подключено — автоотправка trade offer недоступна'}
      </p>
      {!compact ? (
        <p className="muted small" data-testid="extension-browser-hint">
          Используйте Chrome с тем же профилем, где открыт{' '}
          <a href="https://steamcommunity.com" target="_blank" rel="noreferrer">
            steamcommunity.com
          </a>{' '}
          и вы залогинены под продавцом.
        </p>
      ) : null}
      {message ? <p className="alert alert-success">{message}</p> : null}
      {error ? <p className="alert alert-error">{error}</p> : null}
      <div className="extension-panel-actions">
        {status.connected ? (
          <button
            type="button"
            className="button secondary sm"
            disabled={loading}
            onClick={() => void handleDisconnect()}
          >
            Отключить
          </button>
        ) : (
          <button
            type="button"
            className="button primary sm"
            disabled={loading}
            data-testid="extension-connect-button"
            onClick={() => void handleConnect()}
          >
            {loading ? 'Подключаем…' : 'Подключить расширение'}
          </button>
        )}
      </div>
    </div>
  );
}
