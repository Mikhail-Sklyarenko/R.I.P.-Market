import { Outlet, useLocation } from 'react-router-dom';
import { AuthRequiredPage } from '../components/AuthRequiredPage';
import { useLocale } from '../i18n';
import { rememberSteamReturnPath } from '../utils/steam-return-path';
import { useAuth } from './AuthContext';

export function SellProtectedRoute() {
  const { token } = useAuth();
  const location = useLocation();
  const { t } = useLocale();
  const returnPath = `${location.pathname}${location.search}${location.hash}`;

  if (!token) {
    rememberSteamReturnPath(returnPath);
    return (
      <AuthRequiredPage
        title={t('auth.sellRequiredTitle')}
        subtitle={t('auth.sellRequiredSubtitle')}
        returnPath={returnPath}
        testId="sell-auth-required"
      />
    );
  }

  return <Outlet />;
}
