import { Link } from 'react-router-dom';
import type { WalletSummary } from '../wallet/WalletContext';
import { MoneyDisplay } from './MoneyDisplay';

type HeaderWalletBalanceProps = {
  summary: WalletSummary | null;
  loading: boolean;
};

function sumLockedMinor(summary: WalletSummary | null): number {
  if (!summary) {
    return 0;
  }
  return Number(summary.holdMinor) + Number(summary.frozenMinor);
}

function SnowflakeIcon() {
  return (
    <svg
      className="header-wallet-pill-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 2v20M12 2l-2.5 3M12 2l2.5 3M12 22l-2.5-3M12 22l2.5-3" />
      <path d="M4.5 7.5 19.5 16.5M19.5 7.5 4.5 16.5" />
      <path d="M2 12h20M5 5.5l14 13M19 5.5 5 18.5" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg
      className="header-wallet-pill-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 17.5V7.5Z" />
      <path d="M17 12h3.5a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H17" />
      <circle cx="17.5" cy="11.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function HeaderWalletBalance({ summary, loading }: HeaderWalletBalanceProps) {
  const lockedMinor = sumLockedMinor(summary);
  const availableMinor = summary?.availableMinor ?? '0';
  const showLocked = lockedMinor > 0;

  const title = showLocked
    ? 'Кошелёк: доступно и средства в hold / заморозке'
    : 'Кошелёк: доступный баланс';

  return (
    <Link
      to="/wallet"
      className="header-wallet-balances"
      data-testid="header-wallet-balance"
      title={title}
      aria-label={title}
    >
      {loading && !summary ? (
        <span className="header-wallet-pill header-wallet-pill-loading muted small">…</span>
      ) : (
        <>
          {showLocked ? (
            <span
              className="header-wallet-pill header-wallet-pill-frozen"
              data-testid="header-wallet-frozen"
            >
              <SnowflakeIcon />
              <MoneyDisplay minor={lockedMinor} strong />
              <span className="header-wallet-pill-label">заморожено</span>
            </span>
          ) : null}
          <span
            className="header-wallet-pill header-wallet-pill-available"
            data-testid="header-wallet-available"
          >
            <WalletIcon />
            <MoneyDisplay minor={availableMinor} strong />
            <span className="header-wallet-pill-label">доступно</span>
          </span>
        </>
      )}
    </Link>
  );
}
