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
  const { summary: walletSummary } = useWalletSummary();
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
            <button
              type="button"
              className="app-nav-link app-nav-button"
              data-testid="nav-faq"
              onClick={() => setSupportOpen(true)}
            >
              FAQ
            </button>
          </nav>
        </div>

        <div className="app-header-actions">
          {isAuthenticated && walletSummary ? (
            <>
              <Link
                to="/wallet"
                className="header-wallet-balance"
                data-testid="header-wallet-balance"
                title="Доступный баланс"
              >
                <MoneyDisplay minor={walletSummary.availableMinor} strong />
              </Link>
              <Link
                to="/wallet"
                className="header-wallet-deposit"
                data-testid="header-wallet-deposit"
                title="Пополнить баланс"
                aria-label="Пополнить баланс"
              >
                +
              </Link>
            </>
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
