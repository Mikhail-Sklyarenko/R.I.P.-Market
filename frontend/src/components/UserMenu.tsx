import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { SteamLoginButton } from './SteamLoginButton';
import { hasLinkedSteamId } from '../utils/steam-id';
import { getUserAvatarUrl, getUserInitials } from '../utils/user-avatar';

/**
 * Guest CTA is always Steam — never `/login?dev=1`.
 * Mock login remains QA-only via explicit URL; API outages must not send customers there.
 */
export function UserMenu() {
  const { t } = useLocale();
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
      <SteamLoginButton testId="nav-login-steam" label={t('nav.login')} />
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
            <div className="user-menu-meta" title={t('account.steamLinked')}>
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
              {t('account.steamNotLinked')}
            </Link>
          )}
          <Link
            to="/account"
            className="user-menu-item"
            data-testid="user-menu-account"
            onClick={() => setOpen(false)}
          >
            {t('account.cabinet')}
          </Link>
          <Link
            to="/deals"
            className="user-menu-item"
            data-testid="user-menu-deals"
            onClick={() => setOpen(false)}
          >
            {t('account.deals')}
          </Link>
          {isAdmin ? (
            <>
              <Link
                to="/admin/extension"
                className="user-menu-item"
                data-testid="user-menu-admin-extension"
                onClick={() => setOpen(false)}
              >
                Extension Ops
              </Link>
              <Link
                to="/admin/orders"
                className="user-menu-item"
                data-testid="user-menu-admin"
                onClick={() => setOpen(false)}
              >
                {t('account.admin')}
              </Link>
              <Link
                to="/admin/prices"
                className="user-menu-item"
                data-testid="user-menu-admin-prices"
                onClick={() => setOpen(false)}
              >
                {t('account.adminPrices')}
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
            {t('account.logout')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
