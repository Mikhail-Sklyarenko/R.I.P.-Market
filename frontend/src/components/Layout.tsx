import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NotificationsBell } from './NotificationsBell';
import { UserMenu } from './UserMenu';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-nav-link active' : 'app-nav-link';
}

export function Layout() {
  const { token, user } = useAuth();
  const isAuthenticated = Boolean(token);
  const isSeller = user?.role === 'SELLER';

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
            {isAuthenticated && isSeller ? (
              <NavLink
                to="/sell/inventory"
                className={navLinkClass}
                data-testid="nav-sell"
              >
                Продать
              </NavLink>
            ) : null}
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
