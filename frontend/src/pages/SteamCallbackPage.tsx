import { apiRequest } from '../api/client';
import { useEffect, useState, useRef } from 'react';
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

  const exchange = useRef<Promise<{
    accessToken: string;
    user: Parameters<typeof login>[1];
  }> | null>(null);
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

    const code = searchParams.get('code');
    if (!code) {
      setError({
        code: null,
        message: t('steamCallbackPage.incompleteResponse'),
      });
      return;
    }
    const linked = searchParams.get('linked') === '1';
    // StrictMode can re-run effects; share the single one-time exchange request.
    exchange.current ??= apiRequest('/auth/steam/exchange', {
      method: 'POST',
      body: { code },
    });
    let active = true;
    void exchange.current
      .then((result) => {
        if (!active) return;
        login(result.accessToken, result.user);
        const destination = linked
          ? '/account'
          : (consumeSteamReturnPath() ?? getHomePathForRole(result.user.role));
        navigate(destination, {
          replace: true,
          state: linked ? { steamLinked: true } : undefined,
        });
      })
      .catch((error) => {
        if (active)
          setError({
            code: null,
            message:
              error instanceof Error
                ? error.message
                : t('steamCallbackPage.incompleteResponse'),
          });
      });
    return () => {
      active = false;
    };
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
                <Link
                  key={`${action.href}-${action.label}`}
                  className="button secondary"
                  to={action.href}
                >
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
