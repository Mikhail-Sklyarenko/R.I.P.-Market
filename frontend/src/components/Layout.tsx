import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useWalletSummary } from '../hooks/useWalletSummary';
import { MoneyDisplay } from './MoneyDisplay';
import { TradeUrlBanner } from './TradeUrlBanner';
import { UserMenu } from './UserMenu';
import { NotificationsWidget } from './NotificationsWidget';
import { SupportWidget } from './SupportWidget';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-nav-link active' : 'app-nav-link';
}

export function Layout() {
  const { token, user } = useAuth();
  const { summary: walletSummary, loading: walletLoading } = useWalletSummary();
  const [supportOpen, setSupportOpen] = useState(false);
  const isAuthenticated = Boolean(token);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-start">
          <Link to="/catalog" className="app-brand">
            <p className="eyebrow">R.I.P. Market</p>
            <h1>CS2 P2P</h1>
          </Link>

          <nav className="app-nav" aria-label="Main navigation">
            <NavLink to="/catalog" className={navLinkClass} data-testid="nav-catalog">
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
            <Link
              to="/wallet"
              className="header-wallet-balance"
              data-testid="header-wallet-balance"
              title="Кошелёк"
            >
              {walletLoading && !walletSummary ? (
                <span className="muted small">…</span>
              ) : (
                <MoneyDisplay minor={walletSummary?.availableMinor ?? '0'} strong />
              )}
            </Link>
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
