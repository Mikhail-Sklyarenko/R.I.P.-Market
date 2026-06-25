import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">R.I.P. Market</p>
          <h1>Seller workspace</h1>
        </div>
        <nav className="app-nav">
          <Link to="/sell/inventory">Inventory</Link>
          <Link to="/sell/my-lots">My sales</Link>
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
