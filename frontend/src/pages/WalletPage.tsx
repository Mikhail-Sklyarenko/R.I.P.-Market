import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  createIdempotencyKey,
  getAuthConfig,
  getWallet,
  getWalletTransactions,
  mockDeposit,
} from '../api/marketplace';
import type { LedgerEntry, Wallet } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import { formatUsdFromMinor, parseUsdToMinor, canShowDevPanels } from '../utils/format';
import {
  formatLedgerAmount,
  formatLedgerEntryType,
  ledgerAmountClass,
  resolveLedgerOrderId,
} from '../utils/ledger-labels';

const MIN_DEPOSIT_MINOR = 100;

export function WalletPage() {
  const { token, user } = useAuth();
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
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [mockDepositEnabled, setMockDepositEnabled] = useState(false);

  const showDepositForm = mockDepositEnabled && canShowDevPanels(user?.role);

  const loadWallet = useCallback(async () => {
    if (!token) {
      return;
    }
    const [walletData, txData] = await Promise.all([
      getWallet(token),
      getWalletTransactions(token),
    ]);
    setWallet(walletData);
    setTransactions(txData);
  }, [token]);

  useEffect(() => {
    getAuthConfig()
      .then((config) => setMockDepositEnabled(config.mockDepositEnabled))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    loadWallet()
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token, loadWallet]);

  function validateDepositAmount(): number | null {
    const amountMinor = parseUsdToMinor(amountInput);
    if (!amountMinor) {
      setFieldError('Enter a valid deposit amount.');
      return null;
    }
    if (amountMinor < MIN_DEPOSIT_MINOR) {
      setFieldError('Minimum deposit is $1.00.');
      return null;
    }
    setFieldError(null);
    return amountMinor;
  }

  async function handleDeposit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }

    const amountMinor = validateDepositAmount();
    if (!amountMinor) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await mockDeposit(token, amountMinor, createIdempotencyKey('deposit'));
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
      <PageHeader
        title="Кошелёк"
        subtitle="Средства на маркетплейсе: доступно, в резерве и заморожено."
        actions={
          wallet ? (
            <div className="wallet-header-balance" data-testid="wallet-header-available">
              <span className="eyebrow">Доступно</span>
              <MoneyDisplay minor={wallet.summary.availableMinor} strong />
            </div>
          ) : null
        }
      />

      {returnUrl ? (
        <Link to={returnUrl} className="button secondary wallet-back-link">
          Назад
        </Link>
      ) : null}

      {neededMinor ? (
        <ErrorAlert
          variant="info"
          title="Deposit required"
          data-testid="deposit-needed-banner"
        >
          You need at least {formatUsdFromMinor(neededMinor)} to complete your purchase.
        </ErrorAlert>
      ) : null}

      <div className="card wallet-hold-info" data-testid="wallet-hold-info">
        <h3>Что такое hold?</h3>
        <p className="muted small">
          При покупке сумма сделки переводится из «Доступно» в «В hold» — деньги
          зарезервированы, но ещё не переданы продавцу. После подтверждения обмена
          в Steam hold списывается в пользу продавца. При отмене или неудачной сделке
          средства возвращаются в «Доступно».
        </p>
      </div>

      {loading ? <LoadingState message="Загрузка кошелька…" /> : null}

      {wallet ? (
        <>
          <div className="wallet-balance-grid" data-testid="wallet-balances">
            <div
              className="card wallet-balance-card wallet-balance-available"
              data-testid="wallet-available"
            >
              <span className="eyebrow">Доступно</span>
              <MoneyDisplay
                minor={wallet.summary.availableMinor}
                strong
                className="wallet-balance-value"
              />
              <p className="muted small">Можно потратить на покупки</p>
            </div>
            <div className="card wallet-balance-card" data-testid="wallet-hold">
              <span className="eyebrow">В hold</span>
              <MoneyDisplay
                minor={wallet.summary.holdMinor}
                strong
                className="wallet-balance-value"
              />
              <p className="muted small">Зарезервировано в активных сделках</p>
            </div>
            <div className="card wallet-balance-card" data-testid="wallet-frozen">
              <span className="eyebrow">Заморожено</span>
              <MoneyDisplay
                minor={wallet.summary.frozenMinor}
                strong
                className="wallet-balance-value"
              />
              <p className="muted small">Временно недоступно</p>
            </div>
          </div>

          {showDepositForm ? (
          <form
            className="card form-card wallet-deposit-form"
            onSubmit={(event) => void handleDeposit(event)}
            data-testid="wallet-mock-deposit-form"
          >
            <h3>Mock deposit</h3>
            <p className="muted small">
              Тестовое пополнение для staging. Каждый запрос отправляется с новым
              Idempotency-Key.
            </p>

            <FormField label="Amount (USD)" htmlFor="deposit-amount-input">
              <input
                id="deposit-amount-input"
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(event) => {
                  setAmountInput(event.target.value);
                  setFieldError(null);
                }}
                data-testid="deposit-amount-input"
              />
            </FormField>

            {fieldError ? <p className="field-error">{fieldError}</p> : null}
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
          ) : null}
        </>
      ) : null}

      {transactions.length > 0 ? (
        <div className="card wallet-transactions" data-testid="wallet-transactions">
          <h3>История операций</h3>
          <div className="table-wrap">
            <table className="data-table" data-testid="wallet-transactions-table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Сумма</th>
                  <th>Дата</th>
                  <th>Сделка</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const orderId = resolveLedgerOrderId(tx);
                  return (
                    <tr key={tx.id} data-testid={`wallet-tx-${tx.type}`}>
                      <td>{formatLedgerEntryType(tx.type)}</td>
                      <td>
                        <span className={ledgerAmountClass(tx.amountMinor)}>
                          {formatLedgerAmount(tx.amountMinor)}
                        </span>
                      </td>
                      <td>{new Date(tx.createdAt).toLocaleString()}</td>
                      <td>
                        {orderId ? (
                          <Link
                            to={`/orders/${orderId}`}
                            data-testid={`wallet-tx-order-${orderId}`}
                          >
                            Открыть сделку
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
