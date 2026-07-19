import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { startSteamLogin } from '../utils/start-steam-login';

type SteamLoginButtonProps = {
  /** Where to send the user after Steam login. Defaults to current location. */
  returnPath?: string | null;
  className?: string;
  size?: 'sm' | 'md';
  testId?: string;
  label?: string;
};

function SteamMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-10 9.25v.08l5.54 2.3a3.13 3.13 0 0 1 1.84-.17l2.52-3.65v-.05a3.75 3.75 0 1 1 3.75 3.75h-.09l-3.6 2.56v.08a3.13 3.13 0 0 1-6.1 1.01L2.3 15.6A10 10 0 1 0 12 2Zm-1.5 14.55 1.28.53a2.03 2.03 0 0 0 2.56-1.15 2.03 2.03 0 0 0-1.15-2.56l-1.32-.55a3.12 3.12 0 0 1-1.37 3.73Zm6.38-5.8a2.5 2.5 0 1 0-2.5-2.5 2.5 2.5 0 0 0 2.5 2.5Zm0-1.4a1.1 1.1 0 1 1 1.1-1.1 1.1 1.1 0 0 1-1.1 1.1Z"
      />
    </svg>
  );
}

/**
 * Primary Steam sign-in control — matches R.I.P. Market primary CTA styling.
 */
export function SteamLoginButton({
  returnPath,
  className,
  size = 'sm',
  testId = 'nav-login-steam',
  label = 'Войти через Steam',
}: SteamLoginButtonProps) {
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) {
      return;
    }
    setLoading(true);
    const path =
      returnPath ?? `${location.pathname}${location.search}${location.hash}`;
    try {
      await startSteamLogin(path);
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={[
        'button',
        'primary',
        size === 'sm' ? 'sm' : '',
        'steam-login-button',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={loading}
      data-testid={testId}
      onClick={() => void handleClick()}
    >
      <SteamMark className="steam-login-button-icon" />
      <span>{loading ? 'Переход в Steam…' : label}</span>
    </button>
  );
}
