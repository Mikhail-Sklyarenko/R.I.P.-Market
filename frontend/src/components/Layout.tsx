import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useWalletSummary } from '../hooks/useWalletSummary';
import { hasLinkedSteamId } from '../utils/steam-id';
import { MoneyDisplay } from './MoneyDisplay';
import { NotificationsBell } from './NotificationsBell';
import { UserMenu } from './UserMenu';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-nav-link active' : 'app-nav-link';
}

export function Layout() {
  const { token, user } = useAuth();
  const { summary: walletSummary } = useWalletSummary();
  const isAuthenticated = Boolean(token);
  const isSeller = user?.role === 'SELLER';
  const canSell = isSeller || hasLinkedSteamId(user?.steamId);

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/catalog" className="app-brand">
          <p className="eyebrow">R.I.P. Market</p>
          <h1>CS2 P2P</h1>
        </Link>

        <div className="app-header-actions">
          <nav className="app-nav" aria-label="Main navigation">
            <NavLink to="/catalog" className={navLinkClass} data-testid="nav-catalog">
              Каталог
            </NavLink>
            {isAuthenticated && canSell ? (
              <>
                <NavLink
                  to="/sell/inventory"
                  className={navLinkClass}
                  data-testid="nav-sell"
                >
                  Продать
                </NavLink>
                <NavLink
                  to="/sell/my-lots"
                  className={navLinkClass}
                  data-testid="nav-my-lots"
                >
                  Мои лоты
                </NavLink>
              </>
            ) : null}
            <NavLink to="/support" className={navLinkClass} data-testid="nav-support">
              Поддержка
            </NavLink>
            {isAuthenticated ? (
              <>
                <NavLink
                  to="/my/orders"
                  className={navLinkClass}
                  data-testid="nav-orders"
                >
                  Мои сделки
                </NavLink>
                <NavLink
                  to="/wallet"
                  className={navLinkClass}
                  data-testid="nav-wallet"
                >
                  Кошелёк
                </NavLink>
              </>
            ) : null}
          </nav>

          {isAuthenticated && walletSummary ? (
            <Link
              to="/wallet"
              className="header-wallet-balance"
              data-testid="header-wallet-balance"
              title="Доступный баланс"
            >
              <MoneyDisplay minor={walletSummary.availableMinor} strong />
            </Link>
          ) : null}

          {isAuthenticated ? <NotificationsBell /> : null}
          <UserMenu />
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
