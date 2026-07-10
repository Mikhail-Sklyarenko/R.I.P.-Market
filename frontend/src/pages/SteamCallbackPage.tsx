import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import {
  getHomePathForRole,
  getSteamCallbackActions,
  getSteamCallbackMessage,
} from '../utils/format';

export function SteamCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<{
    code: string | null;
    message: string;
  } | null>(null);

  useEffect(() => {
    const errorCode = searchParams.get('error');
    const messageParam = searchParams.get('message');

    if (errorCode || (messageParam && !searchParams.get('accessToken'))) {
      setError({
        code: errorCode,
        message: getSteamCallbackMessage(errorCode, messageParam),
      });
      return;
    }

    const accessToken = searchParams.get('accessToken');
    const userId = searchParams.get('userId');
    const username = searchParams.get('username');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const steamId = searchParams.get('steamId');
    const steamPersonaName = searchParams.get('steamPersonaName');
    const steamAvatarUrl = searchParams.get('steamAvatarUrl');

    if (!accessToken || !userId || !username || !role || !status) {
      setError({
        code: null,
        message: 'Ответ Steam неполный. Попробуйте войти снова.',
      });
      return;
    }

    login(accessToken, {
      id: userId,
      username,
      role,
      status,
      steamId: steamId ?? undefined,
      steamPersonaName: steamPersonaName ?? undefined,
      steamAvatarUrl: steamAvatarUrl ?? undefined,
    });
    const linked = searchParams.get('linked') === '1';
    navigate(linked ? '/account' : getHomePathForRole(role), {
      replace: true,
      state: linked ? { steamLinked: true } : undefined,
    });
  }, [login, navigate, searchParams]);

  const actions = error ? getSteamCallbackActions(error.code) : [];

  return (
    <div className="page page-centered">
      <div className="card login-card" data-testid="steam-callback-page">
        <p className="eyebrow">R.I.P. Market</p>
        <h1>Вход через Steam</h1>
        {error ? (
          <>
            <ErrorAlert error={new Error(error.message)} />
            {error.code === 'STEAM_ALREADY_LINKED' ? (
              <p className="muted small steam-callback-hint">
                Если этот Steam уже привязан к вашему аккаунту, войдите под ним. Если Steam
                привязан к другому пользователю — используйте тот аккаунт или обратитесь в
                поддержку.
              </p>
            ) : null}
            <div className="steam-callback-actions">
              {actions.map((action) => (
                <Link key={`${action.href}-${action.label}`} className="button secondary" to={action.href}>
                  {action.label}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Завершаем вход через Steam…</p>
        )}
      </div>
    </div>
  );
}
