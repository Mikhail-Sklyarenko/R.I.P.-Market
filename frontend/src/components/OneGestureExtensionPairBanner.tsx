import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getAuthConfig } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import {
  getExtensionRuntimeStatus,
  isExtensionRuntimeAvailable,
  pairExtension,
} from '../utils/extension';

const DISMISS_KEY = 'rip.extension.oneGesturePair.dismissed';

function isDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * T3b: one-gesture pair — soft site-wide prompt when the extension is
 * installed but not yet paired. Requires an explicit click (no silent pair).
 */
export function OneGestureExtensionPairBanner() {
  const { t, locale } = useLocale();
  const { token } = useAuth();
  const location = useLocation();
  const [channelEnabled, setChannelEnabled] = useState(false);
  const [connected, setConnected] = useState(true);
  const [dismissed, setDismissed] = useState(isDismissed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtimeAvailable = isExtensionRuntimeAvailable();
  const onAccountPage = location.pathname.startsWith('/account');

  useEffect(() => {
    let cancelled = false;
    getAuthConfig()
      .then((config) => {
        if (!cancelled) {
          setChannelEnabled(Boolean(config.extension?.extensionChannelEnabled));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const status = await getExtensionRuntimeStatus();
    setConnected(status.connected);
  }, []);

  useEffect(() => {
    if (!channelEnabled || !runtimeAvailable || !token) {
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const status = await getExtensionRuntimeStatus();
      if (!cancelled) {
        setConnected(status.connected);
      }
    };
    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [channelEnabled, runtimeAvailable, token]);

  if (
    !token ||
    !channelEnabled ||
    !runtimeAvailable ||
    connected ||
    dismissed ||
    onAccountPage
  ) {
    return null;
  }

  async function handlePair() {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    const result = await pairExtension(token, locale);
    setLoading(false);
    if (result.ok) {
      await refresh();
      markDismissed();
      setDismissed(true);
      return;
    }
    setError(result.error);
  }

  function handleDismiss() {
    markDismissed();
    setDismissed(true);
  }

  return (
    <div
      className="one-gesture-pair-banner"
      data-testid="one-gesture-pair-banner"
      role="status"
    >
      <div className="one-gesture-pair-banner-copy">
        <p className="one-gesture-pair-banner-title">
          {t('oneGesturePair.title')}
        </p>
        <p className="muted small one-gesture-pair-banner-body">
          {t('oneGesturePair.body')}
        </p>
        {error ? (
          <p className="error-text small" data-testid="one-gesture-pair-error">
            {error}
          </p>
        ) : null}
      </div>
      <div className="one-gesture-pair-banner-actions">
        <button
          type="button"
          className="button primary sm"
          disabled={loading}
          data-testid="one-gesture-pair-connect"
          onClick={() => void handlePair()}
        >
          {loading ? t('oneGesturePair.connecting') : t('oneGesturePair.connect')}
        </button>
        <button
          type="button"
          className="button secondary sm"
          data-testid="one-gesture-pair-dismiss"
          onClick={handleDismiss}
        >
          {t('oneGesturePair.dismiss')}
        </button>
      </div>
    </div>
  );
}
