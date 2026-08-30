import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n';
import {
  disconnectExtension,
  getExtensionRuntimeStatus,
  isExtensionRuntimeAvailable,
  pairExtension,
  type ExtensionRuntimeStatus,
} from '../utils/extension';
import { CS2_STEAM_INVENTORY_URL } from '../utils/steam-inventory-links';

type ExtensionConnectPanelProps = {
  token: string;
  compact?: boolean;
  /** Seller auto-send vs buyer safe-accept pairing copy. */
  purpose?: 'seller_auto' | 'buyer_safe_accept';
  onConnectedChange?: (connected: boolean) => void;
};

export function ExtensionConnectPanel({
  token,
  compact = false,
  purpose = 'seller_auto',
  onConnectedChange,
}: ExtensionConnectPanelProps) {
  const { t, locale } = useLocale();
  const [status, setStatus] = useState<ExtensionRuntimeStatus>({ connected: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runtimeAvailable = isExtensionRuntimeAvailable();
  const isBuyerSafeAccept = purpose === 'buyer_safe_accept';
  const onConnectedChangeRef = useRef(onConnectedChange);
  onConnectedChangeRef.current = onConnectedChange;

  const refresh = useCallback(async () => {
    const next = await getExtensionRuntimeStatus();
    setStatus(next);
    onConnectedChangeRef.current?.(next.connected);
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
    const result = await pairExtension(token, locale);
    setLoading(false);
    if (result.ok) {
      setMessage(
        isBuyerSafeAccept
          ? t('buyerExtensionPair.connectSuccess')
          : t('extension.connectSuccess'),
      );
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
    if (compact) {
      return (
        <div
          className="extension-panel extension-panel-compact"
          data-testid="extension-install-hint"
          data-purpose={purpose}
        >
          <h3 className="extension-panel-title">
            {isBuyerSafeAccept
              ? t('buyerExtensionPair.installTitle')
              : t('extension.titleFull')}
          </h3>
          <p className="muted small">
            {isBuyerSafeAccept
              ? t('buyerExtensionPair.installBody')
              : t('extension.compactSubtitle')}
          </p>
          <details className="extension-install-details">
            <summary>{t('extension.installHow')}</summary>
            <p className="muted small">{t('extension.installBodyCompact')}</p>
          </details>
        </div>
      );
    }

    return (
      <div className="card extension-panel" data-testid="extension-install-hint">
        <h3 className="extension-panel-title">{t('extension.titleFull')}</h3>
        <p className="muted small">{t('extension.installBodyFull')}</p>
      </div>
    );
  }

  return (
    <div
      className={`extension-panel${compact ? ' extension-panel-compact' : ' card'}`}
      data-testid="extension-connect-panel"
      data-purpose={purpose}
    >
      <h3 className="extension-panel-title">
        {compact
          ? isBuyerSafeAccept
            ? t('buyerExtensionPair.panelTitle')
            : t('extension.titleCompact')
          : t('extension.titleFull')}
      </h3>
      <p className="muted small" data-testid="extension-connection-status">
        {status.connected
          ? status.expiresAt
            ? t('extension.connectedUntil', {
                time: new Date(status.expiresAt).toLocaleTimeString(),
              })
            : t('extension.connected')
          : isBuyerSafeAccept
            ? t('buyerExtensionPair.notConnected')
            : t('extension.notConnected')}
      </p>
      {!compact ? (
        <p className="muted small" data-testid="extension-browser-hint">
          {t('extension.browserHint')}{' '}
          <a href="https://steamcommunity.com" target="_blank" rel="noreferrer">
            steamcommunity.com
          </a>{' '}
          {t('extension.browserHintSuffix')}
        </p>
      ) : null}
      {message ? <p className="alert alert-success">{message}</p> : null}
      {error ? <p className="alert alert-error">{error}</p> : null}
      {status.connected && !isBuyerSafeAccept && message ? (
        <p className="muted small" data-testid="extension-onboarding-next">
          {t('extension.nextInventory')}{' '}
          <a
            href={CS2_STEAM_INVENTORY_URL}
            target="_blank"
            rel="noreferrer"
          >
            {t('extension.nextInventoryLink')}
          </a>
        </p>
      ) : null}
      <div className="extension-panel-actions">
        {status.connected ? (
          <button
            type="button"
            className="button secondary sm"
            disabled={loading}
            onClick={() => void handleDisconnect()}
          >
            {t('extension.disconnect')}
          </button>
        ) : (
          <button
            type="button"
            className="button primary sm"
            disabled={loading}
            data-testid="extension-connect-button"
            onClick={() => void handleConnect()}
          >
            {loading
              ? t('extension.connecting')
              : isBuyerSafeAccept
                ? t('buyerExtensionPair.connectCta')
                : t('extension.connect')}
          </button>
        )}
      </div>
    </div>
  );
}
