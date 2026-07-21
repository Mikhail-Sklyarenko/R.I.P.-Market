import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useWalletSummary } from '../hooks/useWalletSummary';
import { HeaderWalletBalance } from './HeaderWalletBalance';
import { TradeUrlBanner } from './TradeUrlBanner';
import { UserMenu } from './UserMenu';
import { NotificationsWidget } from './NotificationsWidget';
import { SupportWidget } from './SupportWidget';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-nav-link active' : 'app-nav-link';
}

export function Layout() {
  const { token, user } = useAuth();
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

          <nav className="app-nav" aria-label="Main navigation">
            <NavLink
              to="/"
              className={() =>
                catalogActive ? 'app-nav-link active' : 'app-nav-link'
              }
              end
              data-testid="nav-catalog"
            >
              Купить
            </NavLink>
            <NavLink to="/sell/inventory" className={navLinkClass} data-testid="nav-sell">
              Продать
            </NavLink>
            <NavLink to="/faq" className={navLinkClass} data-testid="nav-faq">
              FAQ
            </NavLink>
          </nav>
        </div>

        <div className="app-header-actions">
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
