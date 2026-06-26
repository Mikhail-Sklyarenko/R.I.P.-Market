import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthConfig, getSteamLoginUrl, mockLogin } from '../api/marketplace';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { getHomePathForRole } from '../utils/format';

type AuthMode = 'mock' | 'steam';
type MockRole = 'SELLER' | 'BUYER' | 'ADMIN';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, token, user } = useAuth();
  const [mode, setMode] = useState<AuthMode>('mock');
  const [role, setRole] = useState<MockRole>('BUYER');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (token && user) {
      navigate(getHomePathForRole(user.role), { replace: true });
    }
  }, [token, user, navigate]);

  useEffect(() => {
    getAuthConfig()
      .then(setConfig)
      .catch((err: unknown) => setError(err));
  }, []);

  async function handleMockLogin() {
    setLoading(true);
    setError(null);
    try {
      const response = await mockLogin(role);
      login(response.accessToken, response.user);
      navigate(getHomePathForRole(response.user.role));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSteamLogin() {
    setLoading(true);
    setError(null);
    try {
      const returnUrl = `${window.location.origin}/login`;
      const response = await getSteamLoginUrl(returnUrl);
      window.location.href = response.url;
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  }

  return (
    <div className="page page-centered">
      <div className="card login-card">
        <p className="eyebrow">R.I.P. Market</p>
        <h1>Sign in</h1>
        <p className="muted">Mock login for buyer, seller, or admin flows.</p>

        <div className="segmented" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            className={mode === 'mock' ? 'segment active' : 'segment'}
            onClick={() => setMode('mock')}
          >
            Mock
          </button>
          <button
            type="button"
            className={mode === 'steam' ? 'segment active' : 'segment'}
            onClick={() => setMode('steam')}
          >
            Steam
          </button>
        </div>

        {mode === 'mock' ? (
          <div className="segmented segmented-3" role="tablist" aria-label="Mock role">
            <button
              type="button"
              className={role === 'BUYER' ? 'segment active' : 'segment'}
              onClick={() => setRole('BUYER')}
            >
              Buyer
            </button>
            <button
              type="button"
              className={role === 'SELLER' ? 'segment active' : 'segment'}
              onClick={() => setRole('SELLER')}
            >
              Seller
            </button>
            <button
              type="button"
              className={role === 'ADMIN' ? 'segment active' : 'segment'}
              onClick={() => setRole('ADMIN')}
            >
              Admin
            </button>
          </div>
        ) : null}

        {config ? (
          <p className="muted small">
            Backend: <strong>{config.authProvider}</strong>
            {config.mockTradeEnabled ? ' · mock trade on' : ''}
          </p>
        ) : null}

        <ErrorAlert error={error} />

        {mode === 'mock' ? (
          <button
            type="button"
            className="button primary"
            disabled={loading}
            data-testid={`login-${role.toLowerCase()}`}
            onClick={() => void handleMockLogin()}
          >
            {loading ? 'Signing in…' : `Continue as mock ${role.toLowerCase()}`}
          </button>
        ) : (
          <div className="stack">
            <p className="muted">Steam OpenID callback is not wired yet.</p>
            <button
              type="button"
              className="button secondary"
              disabled={loading || !config?.steamLoginAvailable}
              onClick={() => void handleSteamLogin()}
            >
              {config?.steamLoginAvailable ? 'Open Steam login URL' : 'Steam login unavailable'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
