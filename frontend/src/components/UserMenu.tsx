import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { hasLinkedSteamId } from '../utils/steam-id';

export function UserMenu() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!token || !user) {
    return (
      <Link to="/login" className="button primary sm" data-testid="nav-login">
        Войти
      </Link>
    );
  }

  const isAdmin = user.role === 'ADMIN';
  const steamLinked = hasLinkedSteamId(user.steamId);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid="user-menu-trigger"
      >
        {user.username}
      </button>
      {open ? (
        <div className="user-menu-panel" data-testid="user-menu-panel">
          {steamLinked ? (
            <div className="user-menu-meta" title="Привязанный Steam ID">
              Steam {user.steamId}
            </div>
          ) : (
            <Link
              to="/account"
              className="user-menu-meta user-menu-meta-link"
              data-testid="user-menu-steam-link"
              onClick={() => setOpen(false)}
            >
              Steam не привязан
            </Link>
          )}
          <Link
            to="/account"
            className="user-menu-item"
            onClick={() => setOpen(false)}
          >
            Аккаунт
          </Link>
          {isAdmin ? (
            <Link
              to="/admin/orders"
              className="user-menu-item"
              onClick={() => setOpen(false)}
            >
              Админ
            </Link>
          ) : null}
          <button
            type="button"
            className="user-menu-item"
            onClick={() => {
              logout();
              setOpen(false);
              navigate('/login');
            }}
          >
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}
