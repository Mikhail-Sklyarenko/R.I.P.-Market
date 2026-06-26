import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NotificationsBell } from './NotificationsBell';

export function Layout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const isSeller = user?.role === 'SELLER';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">R.I.P. Market</p>
          <h1>{isSeller ? 'Seller workspace' : 'Marketplace'}</h1>
        </div>
        <nav className="app-nav">
          <Link to="/catalog">Catalog</Link>
          {isSeller ? (
            <>
              <Link to="/sell/inventory">Inventory</Link>
              <Link to="/sell/my-lots">My sales</Link>
            </>
          ) : null}
          <Link to="/wallet">Wallet</Link>
          <Link to="/my/orders">My orders</Link>
          <NotificationsBell />
          {user?.steamId ? (
            <span className="muted small" title="Linked Steam ID">
              Steam {user.steamId}
            </span>
          ) : null}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Logout
          </button>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
