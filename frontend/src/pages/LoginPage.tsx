import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getAuthConfig, getUserMe, mockLogin } from '../api/marketplace';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { SteamLoginButton } from '../components/SteamLoginButton';
import { getHomePathForRole } from '../utils/format';
import { safeAppReturnPath } from '../utils/steam-return-path';
import { profileToAuthUser } from '../utils/user-profile';

type MockRole = 'SELLER' | 'BUYER' | 'ADMIN';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = safeAppReturnPath(searchParams.get('returnUrl'));
  const allowDevMock = searchParams.has('dev') || import.meta.env.DEV;
  const { login, token, user } = useAuth();
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
      .then(setConfig)
      .catch((err: unknown) => setError(err));
  }, []);

  async function handleMockLogin() {
    setLoading(true);
    setError(null);
    try {
      const response = await mockLogin(role);
      const profile = await getUserMe(response.accessToken);
      login(response.accessToken, profileToAuthUser(profile));
      navigate(returnUrl ?? getHomePathForRole(profile.role));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  const mockAvailable = config?.mockLoginAvailable ?? false;
  const steamAvailable = config?.steamLoginAvailable ?? false;
  const showMock = mockAvailable && (allowDevMock || !steamAvailable);
  const showSteam = steamAvailable;

  return (
    <div className="page page-centered">
      <div className="card login-card">
        <p className="eyebrow">R.I.P. Market</p>
        <h1>Вход</h1>
        <p className="muted">
          {showSteam
            ? 'Войдите через Steam, чтобы покупать и продавать скины.'
            : showMock
              ? 'Mock-вход для локальной разработки и QA.'
              : 'Сейчас нет доступных способов входа.'}
        </p>

        <ErrorAlert error={error} />

        {showSteam ? (
          <SteamLoginButton
            returnPath={returnUrl}
            size="md"
            testId="login-steam"
            className="login-steam-cta"
          />
        ) : null}

        {showMock ? (
          <div className={showSteam ? 'login-dev-mock' : undefined}>
            {showSteam ? (
              <p className="muted small login-dev-mock-label">Dev / QA mock</p>
            ) : null}
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
            <button
              type="button"
              className="button secondary"
              disabled={loading}
              data-testid={`login-${role.toLowerCase()}`}
              onClick={() => void handleMockLogin()}
            >
              {loading ? 'Вход…' : `Continue as mock ${role.toLowerCase()}`}
            </button>
          </div>
        ) : null}

        {!showSteam && !showMock && config ? (
          <p className="muted">No login methods are available.</p>
        ) : null}

        <p className="muted small login-back-link">
          <Link to="/catalog">Вернуться в каталог</Link>
        </p>
      </div>
    </div>
  );
}
