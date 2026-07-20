import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAuthConfig } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import { SteamLoginButton } from './SteamLoginButton';
import { hasLinkedSteamId } from '../utils/steam-id';
import { getUserAvatarUrl, getUserInitials } from '../utils/user-avatar';

export function UserMenu() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [steamLoginAvailable, setSteamLoginAvailable] = useState<boolean | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAuthConfig()
      .then((config) => setSteamLoginAvailable(Boolean(config.steamLoginAvailable)))
      .catch(() => setSteamLoginAvailable(false));
  }, []);

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
    if (steamLoginAvailable === null) {
      return (
        <button
          type="button"
          className="button primary sm steam-login-button"
          disabled
          aria-label="Загрузка входа"
          data-testid="nav-login-loading"
        >
          <span>…</span>
        </button>
      );
    }
    if (steamLoginAvailable) {
      return <SteamLoginButton testId="nav-login-steam" />;
    }
    return (
      <Link to="/login?dev=1" className="button primary sm" data-testid="nav-login">
        Войти
      </Link>
    );
  }

  const isAdmin = user.role === 'ADMIN';
  const steamLinked = hasLinkedSteamId(user.steamId);
  const avatarUrl = getUserAvatarUrl(user);
  const initials = getUserInitials(user);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid="user-menu-trigger"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="user-menu-avatar-img"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="user-menu-avatar" aria-hidden="true">
            {initials}
          </span>
        )}
        <span className="user-menu-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="user-menu-panel" data-testid="user-menu-panel">
          {steamLinked ? (
            <div className="user-menu-meta" title="Привязанный Steam">
              {user.steamPersonaName
                ? `${user.steamPersonaName} · ${user.steamId}`
                : `Steam ${user.steamId}`}
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
            data-testid="user-menu-account"
            onClick={() => setOpen(false)}
          >
            Личный кабинет
          </Link>
          <Link
            to="/deals"
            className="user-menu-item"
            data-testid="user-menu-deals"
            onClick={() => setOpen(false)}
          >
            Сделки
          </Link>
          {isAdmin ? (
            <>
              <Link
                to="/admin/orders"
                className="user-menu-item"
                data-testid="user-menu-admin"
                onClick={() => setOpen(false)}
              >
                Админ
              </Link>
              <Link
                to="/admin/prices"
                className="user-menu-item"
                data-testid="user-menu-admin-prices"
                onClick={() => setOpen(false)}
              >
                Цены каталога
              </Link>
            </>
          ) : null}
          <button
            type="button"
            className="user-menu-item"
            data-testid="user-menu-logout"
            onClick={() => {
              logout();
              setOpen(false);
              navigate('/');
            }}
          >
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}
