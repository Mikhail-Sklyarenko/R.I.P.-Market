import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { ErrorAlert } from '../components/ErrorAlert';
import {
  getHomePathForRole,
  getSteamCallbackActions,
  getSteamCallbackMessage,
} from '../utils/format';
import { consumeSteamReturnPath } from '../utils/steam-return-path';

export function SteamCallbackPage() {
  const { locale, t } = useLocale();
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
        message: getSteamCallbackMessage(errorCode, messageParam, locale),
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
        message: t('steamCallbackPage.incompleteResponse'),
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
    const rememberedPath = consumeSteamReturnPath();
    const destination = linked
      ? '/account'
      : rememberedPath ?? getHomePathForRole(role);
    navigate(destination, {
      replace: true,
      state: linked ? { steamLinked: true } : undefined,
    });
  }, [login, navigate, searchParams]);

  const actions = error ? getSteamCallbackActions(error.code, locale) : [];

  return (
    <div className="page page-centered">
      <div className="card login-card" data-testid="steam-callback-page">
        <p className="eyebrow">R.I.P. Market</p>
        <h1>{t('steamCallbackPage.title')}</h1>
        {error ? (
          <>
            <ErrorAlert error={new Error(error.message)} />
            {error.code === 'STEAM_ALREADY_LINKED' ? (
              <p className="muted small steam-callback-hint">
                {t('steamCallbackPage.alreadyLinkedHint')}
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
          <p className="muted">{t('steamCallbackPage.completing')}</p>
        )}
      </div>
    </div>
  );
}
