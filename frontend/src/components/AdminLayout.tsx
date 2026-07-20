import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NotificationsWidget } from './NotificationsWidget';

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-nav-link active' : 'app-nav-link';
}

export function AdminLayout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-start">
          <Link to="/admin/orders" className="app-brand">
            <p className="eyebrow">R.I.P. Market</p>
            <h1>Ops</h1>
          </Link>

          <nav className="app-nav" aria-label="Admin navigation">
            <NavLink to="/admin/orders" className={navLinkClass} end={false}>
              Заказы
            </NavLink>
            <NavLink to="/admin/lots" className={navLinkClass}>
              Лоты
            </NavLink>
            <NavLink to="/admin/users" className={navLinkClass}>
              Пользователи
            </NavLink>
            <NavLink to="/admin/settlement/allowlist" className={navLinkClass}>
              Settlement
            </NavLink>
            <NavLink to="/admin/outbox" className={navLinkClass}>
              Outbox
            </NavLink>
            <NavLink to="/admin/prices" className={navLinkClass}>
              Цены
            </NavLink>
          </nav>
        </div>

        <div className="app-header-actions">
          <Link to="/" className="button secondary sm">
            На маркет
          </Link>
          <span className="muted small" title={user?.steamId ?? undefined}>
            {user?.steamPersonaName || user?.username}
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
      <NotificationsWidget />
    </div>
  );
}
