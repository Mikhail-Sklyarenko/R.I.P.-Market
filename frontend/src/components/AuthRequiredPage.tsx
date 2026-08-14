import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import { SteamLoginButton } from './SteamLoginButton';

type AuthRequiredPageProps = {
  title: string;
  subtitle: string;
  returnPath: string;
  testId?: string;
};

function AuthLockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="28"
      height="28"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 1 1 6 0v3Z"
      />
    </svg>
  );
}

export function AuthRequiredPage({
  title,
  subtitle,
  returnPath,
  testId = 'auth-required-page',
}: AuthRequiredPageProps) {
  const { t } = useLocale();

  return (
    <div className="page page-centered auth-required-page" data-testid={testId}>
      <div className="card auth-required-card">
        <div className="auth-required-icon" aria-hidden="true">
          <AuthLockIcon />
        </div>
        <h1 className="auth-required-title">{title}</h1>
        <p className="muted auth-required-subtitle">{subtitle}</p>
        <div className="auth-required-actions">
          <SteamLoginButton
            returnPath={returnPath}
            size="md"
            testId="auth-required-steam-login"
            label={t('auth.steamLogin')}
          />
          <Link to="/" className="button secondary" data-testid="auth-required-back-catalog">
            {t('auth.backToCatalog')}
          </Link>
        </div>
      </div>
    </div>
  );
}
