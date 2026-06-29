import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAuthConfig, getSteamLoginUrl, mockLogin } from '../api/marketplace';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { getHomePathForRole } from '../utils/format';

type AuthMode = 'mock' | 'steam';
type MockRole = 'SELLER' | 'BUYER' | 'ADMIN';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

function safeReturnUrl(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return null;
  }
  return raw;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = safeReturnUrl(searchParams.get('returnUrl'));
  const { login, token, user } = useAuth();
  const [mode, setMode] = useState<AuthMode>('mock');
  const [role, setRole] = useState<MockRole>('BUYER');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (token && user) {
      navigate(returnUrl ?? getHomePathForRole(user.role), { replace: true });
    }
  }, [token, user, navigate, returnUrl]);

  useEffect(() => {
    getAuthConfig()
      .then((nextConfig) => {
        setConfig(nextConfig);
        if (nextConfig.authProvider === 'steam') {
          setMode('steam');
        }
      })
      .catch((err: unknown) => setError(err));
  }, []);

  async function handleMockLogin() {
    setLoading(true);
    setError(null);
    try {
      const response = await mockLogin(role);
      login(response.accessToken, response.user);
      navigate(returnUrl ?? getHomePathForRole(response.user.role));
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
      const returnUrl = `${API_BASE_URL}/auth/steam/callback`;
      const response = await getSteamLoginUrl(returnUrl);
      window.location.href = response.url;
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  }

  const mockAvailable = config?.mockLoginAvailable ?? true;
  const showMockTab = mockAvailable;
  const showSteamTab = config?.steamLoginAvailable ?? false;

  return (
    <div className="page page-centered">
      <div className="card login-card">
        <p className="eyebrow">R.I.P. Market</p>
        <h1>Sign in</h1>
        <p className="muted">
          {showSteamTab
            ? 'Sign in with your Steam account or use mock roles in dev.'
            : 'Mock login for buyer, seller, or admin flows.'}
        </p>

        {showMockTab && showSteamTab ? (
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
        ) : null}

        {mode === 'mock' && showMockTab ? (
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

        {mode === 'mock' && showMockTab ? (
          <button
            type="button"
            className="button primary"
            disabled={loading}
            data-testid={`login-${role.toLowerCase()}`}
            onClick={() => void handleMockLogin()}
          >
            {loading ? 'Signing in…' : `Continue as mock ${role.toLowerCase()}`}
          </button>
        ) : showSteamTab ? (
          <button
            type="button"
            className="button primary"
            disabled={loading}
            data-testid="login-steam"
            onClick={() => void handleSteamLogin()}
          >
            {loading ? 'Redirecting…' : 'Sign in with Steam'}
          </button>
        ) : (
          <p className="muted">No login methods are available.</p>
        )}
      </div>
    </div>
  );
}
