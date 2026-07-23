import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { useWalletSummary } from '../hooks/useWalletSummary';
import { HeaderWalletBalance } from './HeaderWalletBalance';
import { LanguageSwitcher } from './LanguageSwitcher';
import { TradeUrlBanner } from './TradeUrlBanner';
import { UserMenu } from './UserMenu';
import { NotificationsWidget } from './NotificationsWidget';
import { SupportWidget } from './SupportWidget';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-nav-link active' : 'app-nav-link';
}

export function Layout() {
  const { token, user } = useAuth();
  const { t } = useLocale();
  const location = useLocation();
  const { summary: walletSummary, loading: walletLoading } = useWalletSummary();
  const [supportOpen, setSupportOpen] = useState(false);
  const isAuthenticated = Boolean(token);
  const catalogActive =
    location.pathname === '/' || location.pathname.startsWith('/catalog');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-start">
          <Link to="/" className="app-brand">
            <p className="eyebrow">R.I.P. Market</p>
            <h1>CS2 P2P</h1>
          </Link>

          <nav className="app-nav" aria-label={t('nav.mainAria')}>
            <NavLink
              to="/"
              className={() =>
                catalogActive ? 'app-nav-link active' : 'app-nav-link'
              }
              end
              data-testid="nav-catalog"
            >
              {t('nav.catalog')}
            </NavLink>
            <NavLink to="/sell/inventory" className={navLinkClass} data-testid="nav-sell">
              {t('nav.sell')}
            </NavLink>
            <NavLink to="/faq" className={navLinkClass} data-testid="nav-faq">
              {t('nav.faq')}
            </NavLink>
          </nav>
        </div>

        <div className="app-header-actions">
          <LanguageSwitcher />

          {isAuthenticated ? (
            <HeaderWalletBalance summary={walletSummary} loading={walletLoading} />
          ) : null}

          <UserMenu />
        </div>
      </header>

      <main className="app-main">
        {isAuthenticated ? <TradeUrlBanner user={user} /> : null}
        <Outlet />
      </main>

      <SupportWidget open={supportOpen} onOpenChange={setSupportOpen} />
      {isAuthenticated ? <NotificationsWidget /> : null}
    </div>
  );
}
