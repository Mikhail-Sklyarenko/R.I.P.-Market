import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { getHomePathForRole } from '../utils/format';

export function SteamCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const errorCode = searchParams.get('error');
    if (errorCode) {
      setError(
        new Error(
          searchParams.get('message') ?? 'Steam authentication failed',
        ),
      );
      return;
    }

    const accessToken = searchParams.get('accessToken');
    const userId = searchParams.get('userId');
    const username = searchParams.get('username');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const steamId = searchParams.get('steamId');

    if (!accessToken || !userId || !username || !role || !status) {
      setError(new Error('Incomplete Steam login response'));
      return;
    }

    login(accessToken, {
      id: userId,
      username,
      role,
      status,
      steamId: steamId ?? undefined,
    });
    const linked = searchParams.get('linked') === '1';
    navigate(getHomePathForRole(role), {
      replace: true,
      state: linked ? { steamLinked: true } : undefined,
    });
  }, [login, navigate, searchParams]);

  return (
    <div className="page page-centered">
      <div className="card login-card">
        <p className="eyebrow">R.I.P. Market</p>
        <h1>Steam sign-in</h1>
        {error ? (
          <>
            <ErrorAlert error={error} />
            <Link className="button secondary" to="/login">
              Back to login
            </Link>
          </>
        ) : (
          <p className="muted">Completing Steam sign-in…</p>
        )}
      </div>
    </div>
  );
}
