import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getAuthConfig, getUserMe, mockLogin } from '../api/marketplace';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { getHomePathForRole } from '../utils/format';
import {
  rememberSteamReturnPath,
  safeAppReturnPath,
} from '../utils/steam-return-path';
import { profileToAuthUser } from '../utils/user-profile';

type MockRole = 'SELLER' | 'BUYER' | 'ADMIN';

/**
 * Customer-facing /login is removed — guests use catalog + Steam in the header.
 * This page remains only for QA mock login via /login?dev=1.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = safeAppReturnPath(searchParams.get('returnUrl'));
  const allowDevMock = searchParams.has('dev');
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
    if (!allowDevMock) {
      return;
    }
    getAuthConfig()
      .then(setConfig)
      .catch((err: unknown) => setError(err));
  }, [allowDevMock]);

  if (!allowDevMock) {
    if (returnUrl) {
      rememberSteamReturnPath(returnUrl);
    }
    return <Navigate to="/" replace />;
  }

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

  const mockAvailable = config?.mockLoginAvailable ?? true;

  return (
    <div className="page page-centered">
      <div className="card login-card" data-testid="dev-login-page">
        <p className="eyebrow">R.I.P. Market · Dev</p>
        <h1>Mock login</h1>
        <p className="muted">Только для QA и локальной разработки (`/login?dev=1`).</p>

        <ErrorAlert error={error} />

        {mockAvailable ? (
          <>
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
          </>
        ) : (
          <p className="muted">Mock login недоступен на этом окружении.</p>
        )}

        <p className="muted small login-back-link">
          <Link to="/">В каталог</Link>
        </p>
      </div>
    </div>
  );
}
