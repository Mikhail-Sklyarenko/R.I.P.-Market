import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NotificationsBell } from './NotificationsBell';

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
          <Link to="/admin/outbox">Outbox</Link>
          <NotificationsBell />
          <span className="muted small">{user?.username}</span>
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
