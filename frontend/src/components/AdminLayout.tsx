import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NotificationsWidget } from './NotificationsWidget';

export function AdminLayout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell admin-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">R.I.P. Market</p>
          <h1>Ops console</h1>
        </div>
        <nav className="app-nav">
          <Link to="/admin/orders">Orders</Link>
          <Link to="/admin/lots">Lots</Link>
          <Link to="/admin/users">Users</Link>
          <Link to="/admin/settlement/allowlist">Settlement</Link>
          <Link to="/admin/outbox">Outbox</Link>
          <span className="muted small">{user?.username}</span>
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
              navigate('/');
            }}
          >
            Logout
          </button>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <NotificationsWidget />
    </div>
  );
}
