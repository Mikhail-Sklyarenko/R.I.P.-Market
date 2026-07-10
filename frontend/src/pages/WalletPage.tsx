import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  createIdempotencyKey,
  createWalletWithdrawal,
  getAuthConfig,
  getWallet,
  getWalletDeposit,
  getWalletDepositStatus,
  getWalletWithdrawals,
  getWalletTransactions,
  mockDeposit,
} from '../api/marketplace';
import type {
  AuthConfig,
  LedgerEntry,
  Wallet,
  WalletDepositInfo,
  WalletDepositStatus,
  WithdrawalRequest,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import {
  formatUsdtFromMinor,
  parseUsdToMinor,
  canShowMockDepositPanel,
} from '../utils/format';
import {
  formatLedgerAmount,
  formatLedgerEntryType,
  ledgerAmountClass,
  resolveLedgerOrderId,
} from '../utils/ledger-labels';
import { getTrc20AddressError } from '../utils/trc20-address';
import {
  formatWithdrawalStatus,
  withdrawalStatusClass,
} from '../utils/withdrawal-labels';

const DEPOSIT_STATUS_POLL_MS = 10_000;

function buildQrImageUrl(qrData: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrData)}`;
}

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
  const [paymentConfig, setPaymentConfig] = useState<Pick<
    AuthConfig,
    | 'mockDepositEnabled'
    | 'cryptoPaymentsEnabled'
    | 'minDepositMinor'
    | 'minWithdrawMinor'
    | 'withdrawFeeMinor'
    | 'usdtNetwork'
    | 'usdtToken'
  > | null>(null);
  const [depositInfo, setDepositInfo] = useState<WalletDepositInfo | null>(null);
  const [depositStatus, setDepositStatus] = useState<WalletDepositStatus | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawAmountInput, setWithdrawAmountInput] = useState('');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);

  const mockDepositEnabled = paymentConfig?.mockDepositEnabled ?? false;
  const cryptoPaymentsEnabled = paymentConfig?.cryptoPaymentsEnabled ?? false;
  const minDepositMinor = paymentConfig?.minDepositMinor ?? 100;
  const minWithdrawMinor = paymentConfig?.minWithdrawMinor ?? 100;
  const withdrawFeeMinor = paymentConfig?.withdrawFeeMinor ?? 0;

  const showDepositForm = mockDepositEnabled && canShowMockDepositPanel(user?.role);

  const withdrawAmountMinor = parseUsdToMinor(withdrawAmountInput) ?? 0;
  const withdrawNetMinor = Math.max(withdrawAmountMinor - withdrawFeeMinor, 0);
  const awaitingDeposit = (depositStatus?.intents.length ?? 0) > 0;

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
      .then((config) => {
        setPaymentConfig({
          mockDepositEnabled: config.mockDepositEnabled,
          cryptoPaymentsEnabled: config.cryptoPaymentsEnabled,
          minDepositMinor: config.minDepositMinor,
          minWithdrawMinor: config.minWithdrawMinor,
          withdrawFeeMinor: config.withdrawFeeMinor,
          usdtNetwork: config.usdtNetwork,
          usdtToken: config.usdtToken,
        });
      })
      .catch(() => undefined);
  }, []);

  const loadCryptoData = useCallback(async () => {
    if (!token || !cryptoPaymentsEnabled) {
      return;
    }
    const deposit = await getWalletDeposit(token);
    setDepositInfo(deposit);
    const [status, withdrawalItems] = await Promise.all([
      getWalletDepositStatus(token),
      getWalletWithdrawals(token),
    ]);
    setDepositStatus(status);
    setWithdrawals(withdrawalItems);
  }, [token, cryptoPaymentsEnabled]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    loadWallet()
      .then(() => loadCryptoData())
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token, loadWallet, loadCryptoData]);

  useEffect(() => {
    if (!token || !cryptoPaymentsEnabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void getWalletDepositStatus(token)
        .then((status) => {
          setDepositStatus(status);
          if (status.events.length > (depositStatus?.events.length ?? 0)) {
            void loadWallet();
          }
        })
        .catch(() => undefined);
    }, DEPOSIT_STATUS_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [token, cryptoPaymentsEnabled, depositStatus?.events.length, loadWallet]);

  function validateDepositAmount(): number | null {
    const amountMinor = parseUsdToMinor(amountInput);
    if (!amountMinor) {
      setFieldError('Укажите корректную сумму пополнения.');
      return null;
    }
    if (amountMinor < minDepositMinor) {
      setFieldError(`Минимальное пополнение — ${formatUsdtFromMinor(minDepositMinor)}.`);
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

  async function handleCopyAddress() {
    if (!depositInfo?.address) {
      return;
    }
    await navigator.clipboard.writeText(depositInfo.address);
    setAddressCopied(true);
    window.setTimeout(() => setAddressCopied(false), 2000);
  }

  async function handleWithdraw(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }

    const addressError = getTrc20AddressError(withdrawAddress);
    if (addressError) {
      setWithdrawError(addressError);
      return;
    }

    const amountMinor = parseUsdToMinor(withdrawAmountInput);
    if (!amountMinor) {
      setWithdrawError('Укажите корректную сумму вывода.');
      return;
    }
    if (amountMinor < minWithdrawMinor) {
      setWithdrawError(`Минимальный вывод — ${formatUsdtFromMinor(minWithdrawMinor)}.`);
      return;
    }
    if (amountMinor <= withdrawFeeMinor) {
      setWithdrawError('Сумма вывода должна быть больше комиссии.');
      return;
    }

    setWithdrawSubmitting(true);
    setWithdrawError(null);
    try {
      await createWalletWithdrawal(
        token,
        { toAddress: withdrawAddress.trim(), amountMinor },
        createIdempotencyKey('withdrawal'),
      );
      setWithdrawAmountInput('');
      await Promise.all([loadWallet(), loadCryptoData()]);
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : 'Не удалось создать заявку на вывод.');
    } finally {
      setWithdrawSubmitting(false);
    }
  }

  const depositWarnings = useMemo(
    () => [
      `Только ${paymentConfig?.usdtToken ?? 'USDT TRC-20'} в сети ${paymentConfig?.usdtNetwork ?? 'TRON'}.`,
      'Другие токены и сети будут потеряны безвозвратно.',
      `Минимальное пополнение: ${formatUsdtFromMinor(minDepositMinor)}.`,
      'Курс зачисления: 1 USDT = 1 USD на балансе маркетплейса.',
    ],
    [minDepositMinor, paymentConfig?.usdtNetwork, paymentConfig?.usdtToken],
  );

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
          title="Нужно пополнить кошелёк"
          data-testid="deposit-needed-banner"
        >
          Для покупки нужно минимум {formatUsdtFromMinor(neededMinor)} на балансе.
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

          {cryptoPaymentsEnabled ? (
            <div className="card wallet-deposit-form" data-testid="wallet-usdt-deposit">
              <h3>Пополнить USDT (TRC-20)</h3>
              <ul className="wallet-crypto-warnings" data-testid="deposit-warnings">
                {depositWarnings.map((warning) => (
                  <li key={warning} className="muted small">
                    {warning}
                  </li>
                ))}
              </ul>

              {awaitingDeposit ? (
                <p className="wallet-deposit-awaiting" data-testid="deposit-awaiting-status">
                  Ожидаем перевод… Зачисление появится после подтверждений в сети TRON.
                </p>
              ) : null}

              {depositInfo ? (
                <div className="wallet-deposit-details">
                  <div className="wallet-deposit-qr-wrap">
                    <img
                      src={buildQrImageUrl(depositInfo.qrData)}
                      alt="QR-код для пополнения USDT TRC-20"
                      width={180}
                      height={180}
                      className="wallet-deposit-qr"
                      data-testid="deposit-qr"
                    />
                  </div>
                  <FormField label="Ваш адрес для пополнения" htmlFor="deposit-trc20-address">
                    <div className="wallet-address-row">
                      <input
                        id="deposit-trc20-address"
                        type="text"
                        readOnly
                        value={depositInfo.address}
                        data-testid="deposit-trc20-address"
                      />
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => void handleCopyAddress()}
                        data-testid="deposit-address-copy"
                      >
                        {addressCopied ? 'Скопировано' : 'Копировать'}
                      </button>
                    </div>
                  </FormField>
                </div>
              ) : (
                <p className="muted small">Загрузка адреса…</p>
              )}
            </div>
          ) : null}

          {cryptoPaymentsEnabled ? (
            <form
              className="card form-card wallet-withdraw-form"
              onSubmit={(event) => void handleWithdraw(event)}
              data-testid="wallet-usdt-withdraw-form"
            >
              <h3>Вывод USDT (TRC-20)</h3>
              <p className="muted small">
                Средства спишутся с доступного баланса и будут отправлены на указанный TRC-20
                адрес после проверки.
              </p>
              <FormField label="TRC-20 адрес" htmlFor="withdraw-address-input">
                <input
                  id="withdraw-address-input"
                  type="text"
                  placeholder="T..."
                  value={withdrawAddress}
                  onChange={(event) => {
                    setWithdrawAddress(event.target.value);
                    setWithdrawError(null);
                  }}
                  data-testid="withdraw-address-input"
                />
              </FormField>
              <FormField label="Сумма (USDT)" htmlFor="withdraw-amount-input">
                <input
                  id="withdraw-amount-input"
                  type="text"
                  inputMode="decimal"
                  value={withdrawAmountInput}
                  onChange={(event) => {
                    setWithdrawAmountInput(event.target.value);
                    setWithdrawError(null);
                  }}
                  data-testid="withdraw-amount-input"
                />
              </FormField>
              <div className="wallet-withdraw-summary" data-testid="withdraw-summary">
                <div>
                  <span className="muted small">Комиссия</span>
                  <strong>{formatUsdtFromMinor(withdrawFeeMinor)}</strong>
                </div>
                <div>
                  <span className="muted small">К получению</span>
                  <strong data-testid="withdraw-net-amount">
                    {withdrawAmountMinor > withdrawFeeMinor
                      ? formatUsdtFromMinor(withdrawNetMinor)
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span className="muted small">Минимум</span>
                  <strong>{formatUsdtFromMinor(minWithdrawMinor)}</strong>
                </div>
              </div>
              {withdrawError ? (
                <p className="field-error" data-testid="withdraw-error">
                  {withdrawError}
                </p>
              ) : null}
              {withdrawals.length > 0 ? (
                <div className="wallet-crypto-history" data-testid="wallet-crypto-withdrawals">
                  <h4>История выводов</h4>
                  <ul className="wallet-crypto-list">
                    {withdrawals.slice(0, 10).map((item) => (
                      <li key={item.id} data-testid={`withdrawal-row-${item.id}`}>
                        <div className="wallet-withdrawal-row-main">
                          <span>{formatUsdtFromMinor(item.amountMinor)}</span>
                          <span className="muted small">
                            к получению {formatUsdtFromMinor(item.netMinor)}
                          </span>
                        </div>
                        <span
                          className={`wallet-withdrawal-status ${withdrawalStatusClass(item.status)}`}
                          data-testid={`withdrawal-status-${item.id}`}
                        >
                          {formatWithdrawalStatus(item.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <button
                type="submit"
                className="button primary"
                disabled={withdrawSubmitting}
                data-testid="withdraw-submit"
              >
                {withdrawSubmitting ? 'Отправка…' : 'Вывести USDT'}
              </button>
            </form>
          ) : null}

          {showDepositForm ? (
            <form
              className="card form-card wallet-deposit-form"
              onSubmit={(event) => void handleDeposit(event)}
              data-testid="wallet-mock-deposit-form"
            >
              <h3>Тестовое пополнение</h3>
              <p className="muted small">
                Зачисляет USDT на баланс для проверки покупок на staging. Не настоящие деньги.
              </p>

              <FormField label="Сумма (USDT)" htmlFor="deposit-amount-input">
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
                {submitting ? 'Пополняем…' : 'Пополнить баланс'}
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
