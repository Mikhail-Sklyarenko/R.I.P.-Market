import { useEffect, useState } from 'react';
import { getAuthConfig, getSteamLinkUrl } from '../api/marketplace';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export function AccountPage() {
  const { token, user } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    getAuthConfig()
      .then(setConfig)
      .catch((err: unknown) => setError(err));
  }, []);

  async function handleLinkSteam() {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getSteamLinkUrl(token);
      window.location.href = response.url;
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  }

  const canLinkSteam =
    Boolean(config?.steamLoginAvailable) && Boolean(user) && !user?.steamId;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Account</h2>
          <p className="muted">Profile and Steam identity.</p>
        </div>
      </div>

      <div className="card form-card account-card" data-testid="account-page">
        <dl className="meta-list">
          <div>
            <dt>Username</dt>
            <dd data-testid="account-username">{user?.username ?? '—'}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd data-testid="account-role">{user?.role ?? '—'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd data-testid="account-status">{user?.status ?? '—'}</dd>
          </div>
          <div>
            <dt>Steam ID</dt>
            <dd data-testid="account-steam-id">{user?.steamId ?? 'Not linked'}</dd>
          </div>
        </dl>

        {config ? (
          <p className="muted small">
            Auth provider: <strong>{config.authProvider}</strong>
          </p>
        ) : null}

        {canLinkSteam ? (
          <div className="stack" data-testid="link-steam-panel">
            <p className="muted small">
              Link your Steam account to use real inventory in later phases.
            </p>
            <button
              type="button"
              className="button primary"
              disabled={loading}
              data-testid="link-steam-button"
              onClick={() => void handleLinkSteam()}
            >
              {loading ? 'Redirecting…' : 'Link Steam account'}
            </button>
          </div>
        ) : null}

        {user?.steamId ? (
          <p className="success-text" data-testid="steam-linked-message">
            Steam account linked.
          </p>
        ) : null}

        {!canLinkSteam && !user?.steamId && config?.authProvider === 'mock' ? (
          <p className="muted small" data-testid="steam-link-unavailable">
            Steam linking is available when the backend runs with{' '}
            <code>AUTH_PROVIDER=steam</code>.
          </p>
        ) : null}

        <p className="muted small">
          Steam login callback: <code>{API_BASE_URL}/auth/steam/callback</code>
        </p>

        <ErrorAlert error={error} />
      </div>
    </div>
  );
}
