import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getWallet, getWalletTransactions, mockDeposit } from '../api/marketplace';
import type { LedgerEntry, Wallet } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { formatUsdFromMinor, parseUsdToMinor } from '../utils/format';

export function WalletPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const neededMinor = searchParams.get('needed');

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [amountInput, setAmountInput] = useState(
    neededMinor ? String(Number(neededMinor) / 100) : '1000',
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function loadWallet() {
    if (!token) {
      return;
    }
    const [walletData, txData] = await Promise.all([
      getWallet(token),
      getWalletTransactions(token),
    ]);
    setWallet(walletData);
    setTransactions(txData);
  }

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    loadWallet()
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleDeposit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    const amountMinor = parseUsdToMinor(amountInput);
    if (!amountMinor) {
      setError(new Error('Enter a valid deposit amount.'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await mockDeposit(token, amountMinor);
      await loadWallet();
      if (returnUrl) {
        navigate(returnUrl);
      }
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Wallet</h2>
          <p className="muted">Mock deposit for testing purchases.</p>
        </div>
        {returnUrl ? (
          <Link to={returnUrl} className="button secondary">
            Back to listing
          </Link>
        ) : null}
      </div>

      {neededMinor ? (
        <div className="alert alert-info" data-testid="deposit-needed-banner">
          <strong>Deposit required</strong>
          <p className="alert-meta">
            You need at least {formatUsdFromMinor(neededMinor)} to complete your purchase.
          </p>
        </div>
      ) : null}

      {loading ? <p className="muted">Loading wallet…</p> : null}

      {wallet ? (
        <div className="grid">
          <div className="card">
            <h3>Balances</h3>
            <div className="pricing-preview" data-testid="wallet-balances">
              <div>
                <span>Available</span>
                <strong>{formatUsdFromMinor(wallet.summary.availableMinor)}</strong>
              </div>
              <div>
                <span>On hold</span>
                <strong>{formatUsdFromMinor(wallet.summary.holdMinor)}</strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatUsdFromMinor(wallet.summary.totalMinor)}</strong>
              </div>
            </div>
          </div>

          <form className="card form-card" onSubmit={(event) => void handleDeposit(event)}>
            <h3>Mock deposit</h3>
            <label className="field">
              <span>Amount (USD)</span>
              <input
                type="text"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                data-testid="deposit-amount-input"
              />
            </label>
            <ErrorAlert error={error} />
            <button
              type="submit"
              className="button primary"
              disabled={submitting}
              data-testid="deposit-submit"
            >
              {submitting ? 'Depositing…' : 'Deposit funds'}
            </button>
          </form>
        </div>
      ) : null}

      {transactions.length > 0 ? (
        <div className="card">
          <h3>Recent transactions</h3>
          <ul className="simple-list">
            {transactions.slice(0, 5).map((tx) => (
              <li key={tx.id}>
                {tx.type}: {formatUsdFromMinor(tx.amountMinor)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
