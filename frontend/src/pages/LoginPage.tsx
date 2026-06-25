import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthConfig, getSteamLoginUrl, mockLogin } from '../api/sell';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';

type AuthMode = 'mock' | 'steam';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, token } = useAuth();
  const [mode, setMode] = useState<AuthMode>('mock');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (token) {
      navigate('/sell/inventory', { replace: true });
    }
  }, [token, navigate]);

  useEffect(() => {
    getAuthConfig()
      .then(setConfig)
      .catch((err: unknown) => setError(err));
  }, []);

  async function handleMockLogin() {
    setLoading(true);
    setError(null);
    try {
      const response = await mockLogin('SELLER');
      login(response.accessToken, response.user);
      navigate('/sell/inventory');
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
        <p className="eyebrow">Phase 1</p>
        <h1>Seller login</h1>
        <p className="muted">Sign in to list items from your inventory.</p>

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

        {config ? (
          <p className="muted small">
            Backend auth provider: <strong>{config.authProvider}</strong>
          </p>
        ) : null}

        <ErrorAlert error={error} />

        {mode === 'mock' ? (
          <button
            type="button"
            className="button primary"
            disabled={loading}
            onClick={() => void handleMockLogin()}
          >
            {loading ? 'Signing in…' : 'Continue as mock seller'}
          </button>
        ) : (
          <div className="stack">
            <p className="muted">
              Steam OpenID callback is not wired yet. You can fetch the login URL stub or switch
              back to mock.
            </p>
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
