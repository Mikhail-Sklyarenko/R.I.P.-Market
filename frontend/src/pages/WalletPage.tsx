import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  createIdempotencyKey,
  createWalletDepositCheckout,
  createWalletWithdrawal,
  getAuthConfig,
  getWalletDeposit,
  getWalletDepositStatus,
  getWalletWithdrawals,
  mockDeposit,
} from '../api/marketplace';
import type {
  AuthConfig,
  PaymentMethodRail,
  WalletDepositInfo,
  WalletDepositStatus,
  WithdrawalRequest,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { ErrorAlert } from '../components/ErrorAlert';
import { EmptyState } from '../components/EmptyState';
import { FormField } from '../components/FormField';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import { QrCode } from '../components/QrCode';
import { useWallet } from '../wallet/WalletContext';
import {
  formatUsdFromMinor,
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
import {
  getWalletTabs,
  parseWalletTab,
  type WalletTab,
} from '../utils/wallet-tabs';

const DEPOSIT_STATUS_POLL_MS = 10_000;

export function WalletPage() {
  const { t, locale } = useLocale();
  const { token, user } = useAuth();
  const { wallet, transactions, loading, error, refresh, applyWallet } = useWallet();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const fromCheckout = searchParams.get('fromCheckout') === '1';
  const neededMinor = searchParams.get('needed');
  const activeTab = parseWalletTab(searchParams.get('tab'));

  function setActiveTab(tab: WalletTab) {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }

  const [amountInput, setAmountInput] = useState(() =>
    neededMinor && Number.isFinite(Number(neededMinor))
      ? String(Number(neededMinor) / 100)
      : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [depositError, setDepositError] = useState<unknown>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<Pick<
    AuthConfig,
    | 'mockDepositEnabled'
    | 'cryptoPaymentsEnabled'
    | 'depositMode'
    | 'paymentMethods'
    | 'enableRealSettlement'
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
  const [withdrawPaymentMethod, setWithdrawPaymentMethod] =
    useState<PaymentMethodRail>('trc20');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);
  const [depositCreditedNotice, setDepositCreditedNotice] = useState<string | null>(null);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] =
    useState<PaymentMethodRail>('trc20');
  const knownDepositEventCountRef = useRef(0);

  const mockDepositEnabled = paymentConfig?.mockDepositEnabled ?? false;
  const cryptoPaymentsEnabled = paymentConfig?.cryptoPaymentsEnabled ?? false;
  const depositMode =
    paymentConfig?.depositMode ??
    (cryptoPaymentsEnabled ? 'address' : 'none');
  const paymentMethods = paymentConfig?.paymentMethods?.length
    ? paymentConfig.paymentMethods
    : (['trc20'] as PaymentMethodRail[]);
  const realSettlementEnabled = paymentConfig?.enableRealSettlement ?? false;
  const minDepositMinor = paymentConfig?.minDepositMinor ?? 100;
  const minWithdrawMinor = paymentConfig?.minWithdrawMinor ?? 100;
  const withdrawFeeMinor = paymentConfig?.withdrawFeeMinor ?? 0;

  const showDepositForm = mockDepositEnabled && canShowMockDepositPanel(user?.role);

  const withdrawAmountMinor = parseUsdToMinor(withdrawAmountInput) ?? 0;
  const withdrawNetMinor = Math.max(withdrawAmountMinor - withdrawFeeMinor, 0);
  const awaitingDeposit = (depositStatus?.intents.length ?? 0) > 0;

  const loadCryptoData = useCallback(async () => {
    if (!token || !cryptoPaymentsEnabled) {
      return;
    }
    const [deposit, status, withdrawalItems] = await Promise.all([
      getWalletDeposit(token),
      getWalletDepositStatus(token),
      getWalletWithdrawals(token),
    ]);
    setDepositInfo(deposit);
    setDepositStatus(status);
    setWithdrawals(withdrawalItems);
    knownDepositEventCountRef.current = status.events.length;
    if (deposit.paymentMethods?.length) {
      setCheckoutPaymentMethod(deposit.paymentMethods[0]!);
      setWithdrawPaymentMethod(deposit.paymentMethods[0]!);
    }
  }, [token, cryptoPaymentsEnabled]);

  useEffect(() => {
    getAuthConfig()
      .then((config) => {
        setPaymentConfig({
          mockDepositEnabled: config.mockDepositEnabled,
          cryptoPaymentsEnabled: config.cryptoPaymentsEnabled,
          depositMode: config.depositMode,
          paymentMethods: config.paymentMethods,
          enableRealSettlement: config.enableRealSettlement,
          minDepositMinor: config.minDepositMinor,
          minWithdrawMinor: config.minWithdrawMinor,
          withdrawFeeMinor: config.withdrawFeeMinor,
          usdtNetwork: config.usdtNetwork,
          usdtToken: config.usdtToken,
        });
        if (config.paymentMethods?.length) {
          setCheckoutPaymentMethod(config.paymentMethods[0]!);
          setWithdrawPaymentMethod(config.paymentMethods[0]!);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadCryptoData();
  }, [token, loadCryptoData]);

  useEffect(() => {
    if (!token || !cryptoPaymentsEnabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void getWalletDepositStatus(token)
        .then((status) => {
          const previousCount = knownDepositEventCountRef.current;
          if (status.events.length > previousCount) {
            const latest = status.events[0];
            if (latest) {
              setDepositCreditedNotice(
                t('wallet.depositCredited', {
                  amount: formatUsdFromMinor(latest.amountMinor),
                }),
              );
            }
            knownDepositEventCountRef.current = status.events.length;
            void refresh();
            if (fromCheckout) {
              const next = new URLSearchParams(searchParams);
              next.delete('fromCheckout');
              setSearchParams(next, { replace: true });
            }
          }
          setDepositStatus(status);
        })
        .catch(() => undefined);
    }, fromCheckout ? 3_000 : DEPOSIT_STATUS_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [token, cryptoPaymentsEnabled, refresh, t, fromCheckout, searchParams, setSearchParams]);

  useEffect(() => {
    if (!fromCheckout || !token || !cryptoPaymentsEnabled) {
      return;
    }
    void refresh();
    void loadCryptoData();
  }, [fromCheckout, token, cryptoPaymentsEnabled, refresh, loadCryptoData]);

  function validateDepositAmount(): number | null {
    const amountMinor = parseUsdToMinor(amountInput);
    if (!amountMinor) {
      setFieldError(t('wallet.invalidDeposit'));
      return null;
    }
    if (amountMinor < minDepositMinor) {
      setFieldError(t('wallet.minDepositError', { amount: formatUsdFromMinor(minDepositMinor) }));
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
    setDepositError(null);
    try {
      const result = await mockDeposit(token, amountMinor, createIdempotencyKey('deposit'));
      applyWallet(result.wallet);
      await refresh();
      if (returnUrl) {
        navigate(returnUrl);
      }
    } catch (err) {
      setDepositError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckoutDeposit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }

    const amountMinor = validateDepositAmount();
    if (!amountMinor) {
      return;
    }

    setSubmitting(true);
    setDepositError(null);
    try {
      const origin = window.location.origin;
      const returnParams = new URLSearchParams({
        tab: 'deposit',
        fromCheckout: '1',
      });
      if (returnUrl?.startsWith('/')) {
        returnParams.set('returnUrl', returnUrl);
      }
      const walletReturn = `${origin}/wallet?${returnParams.toString()}`;
      const session = await createWalletDepositCheckout(token, {
        amountMinor,
        paymentMethod: checkoutPaymentMethod,
        returnUrl: walletReturn,
      });
      window.location.assign(session.checkoutUrl);
    } catch (err) {
      setDepositError(err);
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

    if (withdrawPaymentMethod === 'trc20') {
      const addressError = getTrc20AddressError(withdrawAddress, locale);
      if (addressError) {
        setWithdrawError(addressError);
        return;
      }
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(withdrawAddress.trim())) {
      setWithdrawError(t('wallet.invalidEvmAddress'));
      return;
    }

    const amountMinor = parseUsdToMinor(withdrawAmountInput);
    if (!amountMinor) {
      setWithdrawError(t('wallet.invalidWithdraw'));
      return;
    }
    if (amountMinor < minWithdrawMinor) {
      setWithdrawError(t('wallet.minWithdrawError', { amount: formatUsdFromMinor(minWithdrawMinor) }));
      return;
    }
    if (amountMinor <= withdrawFeeMinor) {
      setWithdrawError(t('wallet.withdrawFeeError'));
      return;
    }

    setWithdrawSubmitting(true);
    setWithdrawError(null);
    try {
      await createWalletWithdrawal(
        token,
        {
          toAddress: withdrawAddress.trim(),
          amountMinor,
          paymentMethod: withdrawPaymentMethod,
        },
        createIdempotencyKey('withdrawal'),
      );
      setWithdrawAmountInput('');
      await Promise.all([refresh(), loadCryptoData()]);
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : t('wallet.withdrawFailed'));
    } finally {
      setWithdrawSubmitting(false);
    }
  }

  const depositWarnings = useMemo(() => {
    if (depositMode === 'checkout') {
      return [
        t('wallet.warningCheckoutNetwork'),
        t('wallet.warningOtherLost'),
        t('wallet.warningMinDeposit', { amount: formatUsdFromMinor(minDepositMinor) }),
        t('wallet.warningCreditUsd'),
      ];
    }
    return [
      t('wallet.warningTokenNetwork', {
        token: paymentConfig?.usdtToken ?? 'USDT TRC-20',
        network: paymentConfig?.usdtNetwork ?? 'TRON',
      }),
      t('wallet.warningOtherLost'),
      t('wallet.warningMinDeposit', { amount: formatUsdFromMinor(minDepositMinor) }),
      t('wallet.warningRate'),
    ];
  }, [depositMode, minDepositMinor, paymentConfig?.usdtNetwork, paymentConfig?.usdtToken, t]);

  const neededAmountMinor = useMemo(() => {
    if (!neededMinor) {
      return null;
    }
    const parsed = Number(neededMinor);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [neededMinor]);

  const availableAmountMinor = Number(wallet?.summary.availableMinor ?? 0);
  const frozenAmountMinor = Number(wallet?.summary.frozenMinor ?? 0);
  const showFrozen = frozenAmountMinor > 0;
  const purchaseShortfallMinor =
    neededAmountMinor !== null
      ? Math.max(neededAmountMinor - availableAmountMinor, 0)
      : null;
  const hasPurchaseContext = Boolean(returnUrl) || neededAmountMinor !== null;
  const purchaseReturnHref =
    returnUrl && returnUrl.startsWith('/') ? returnUrl : null;

  useEffect(() => {
    if (purchaseShortfallMinor === null) {
      return;
    }
    const suggest =
      purchaseShortfallMinor > 0 ? purchaseShortfallMinor : neededAmountMinor!;
    setAmountInput(String(suggest / 100));
  }, [purchaseShortfallMinor, neededAmountMinor]);

  return (
    <div className="page wallet-page" data-testid="wallet-page">
      <PageHeader
        title={t('wallet.title')}
        subtitle={
          hasPurchaseContext ? t('wallet.subtitlePurchase') : t('wallet.subtitle')
        }
      />

      {hasPurchaseContext ? (
        <section
          className="card wallet-purchase-context"
          data-testid="deposit-needed-banner"
        >
          <div className="wallet-purchase-context-copy">
            <h2 className="wallet-purchase-context-title">{t('wallet.needDepositTitle')}</h2>
            <p className="muted small">
              {purchaseShortfallMinor !== null && purchaseShortfallMinor > 0
                ? t('wallet.depositShortfall', {
                    amount: formatUsdFromMinor(purchaseShortfallMinor),
                  })
                : neededAmountMinor !== null
                  ? t('wallet.depositNeeded', {
                      amount: formatUsdFromMinor(neededAmountMinor),
                    })
                  : t('wallet.depositReturnHint')}
            </p>
            {purchaseShortfallMinor !== null &&
            purchaseShortfallMinor > 0 &&
            neededAmountMinor !== null &&
            neededAmountMinor !== purchaseShortfallMinor ? (
              <p className="muted small" data-testid="wallet-purchase-needed-total">
                {t('wallet.depositNeeded', {
                  amount: formatUsdFromMinor(neededAmountMinor),
                })}
              </p>
            ) : null}
          </div>
          {purchaseReturnHref ? (
            <Link
              to={purchaseReturnHref}
              className="button secondary wallet-back-link"
              data-testid="wallet-back-to-purchase"
            >
              {t('wallet.backToPurchase')}
            </Link>
          ) : null}
        </section>
      ) : null}

      {cryptoPaymentsEnabled && !realSettlementEnabled ? (
        <ErrorAlert
          variant="info"
          title={t('wallet.realMoneyBetaTitle')}
          data-testid="wallet-real-money-beta-banner"
        >
          {t('wallet.realMoneyBetaBody')}
        </ErrorAlert>
      ) : null}

      {fromCheckout && cryptoPaymentsEnabled && !depositCreditedNotice ? (
        <ErrorAlert
          variant="info"
          title={t('wallet.checkoutReturnTitle')}
          data-testid="wallet-checkout-return-banner"
        >
          {t('wallet.checkoutReturnBody')}
        </ErrorAlert>
      ) : null}

      {depositCreditedNotice ? (
        <ErrorAlert
          variant="info"
          title={t('wallet.depositCreditedTitle')}
          data-testid="wallet-deposit-credited-banner"
        >
          {depositCreditedNotice}
          {purchaseReturnHref ? (
            <p className="wallet-credited-return">
              <Link to={purchaseReturnHref} className="button primary sm">
                {t('wallet.backToPurchase')}
              </Link>
            </p>
          ) : null}
        </ErrorAlert>
      ) : null}

      {loading ? <LoadingState message={t('wallet.loading')} /> : null}

      {!loading && error && !wallet ? <ErrorAlert error={error} /> : null}

      {wallet ? (
        <>
          <section className="card wallet-balance-hero" data-testid="wallet-balances">
            <div className="wallet-balance-hero-primary" data-testid="wallet-available">
              <span className="eyebrow">{t('wallet.available')}</span>
              <MoneyDisplay
                minor={wallet.summary.availableMinor}
                strong
                className="wallet-balance-hero-value"
              />
              <p className="muted small">{t('wallet.availableHint')}</p>
            </div>
            <div className="wallet-balance-hero-secondary">
              <div className="wallet-balance-metric" data-testid="wallet-hold">
                <span className="eyebrow">{t('wallet.hold')}</span>
                <MoneyDisplay minor={wallet.summary.holdMinor} strong />
                <p className="muted small">{t('wallet.holdHint')}</p>
              </div>
              {showFrozen ? (
                <div className="wallet-balance-metric" data-testid="wallet-frozen">
                  <span className="eyebrow">{t('wallet.frozen')}</span>
                  <MoneyDisplay minor={wallet.summary.frozenMinor} strong />
                  <p className="muted small">{t('wallet.frozenHint')}</p>
                </div>
              ) : (
                <div className="wallet-balance-metric wallet-balance-metric-hidden" data-testid="wallet-frozen" hidden>
                  <span className="eyebrow">{t('wallet.frozen')}</span>
                  <MoneyDisplay minor={wallet.summary.frozenMinor} strong />
                </div>
              )}
            </div>
          </section>

          <details className="card wallet-hold-info" data-testid="wallet-hold-info">
            <summary className="wallet-hold-info-summary">{t('wallet.whatIsHoldTitle')}</summary>
            <p className="muted small">{t('wallet.whatIsHoldBody')}</p>
          </details>

          <nav className="wallet-tabs" aria-label={t('wallet.tabsAria')} data-testid="wallet-tabs">
            {getWalletTabs(locale).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`wallet-tab${activeTab === tab.id ? ' wallet-tab-active' : ''}`}
                data-testid={`wallet-tab-${tab.id}`}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === 'deposit' ? (
            <div className="wallet-tab-panel" data-testid="wallet-deposit-panel">
              {hasPurchaseContext ? (
                <p className="wallet-deposit-lead muted small">{t('wallet.depositLeadPurchase')}</p>
              ) : (
                <p className="wallet-deposit-lead muted small">{t('wallet.depositLead')}</p>
              )}

              {cryptoPaymentsEnabled ? (
                depositMode === 'checkout' ? (
                  <form
                    className="card form-card wallet-deposit-form"
                    onSubmit={(event) => void handleCheckoutDeposit(event)}
                    data-testid="wallet-usdt-deposit"
                  >
                    <h3>{t('wallet.depositUsdtCheckoutTitle')}</h3>
                    <ul className="wallet-crypto-warnings" data-testid="deposit-warnings">
                      {depositWarnings.map((warning) => (
                        <li key={warning} className="muted small">
                          {warning}
                        </li>
                      ))}
                    </ul>

                    {awaitingDeposit ? (
                      <p className="wallet-deposit-awaiting" data-testid="deposit-awaiting-status">
                        {t('wallet.depositAwaitingCheckout')}
                      </p>
                    ) : null}

                    <FormField label={t('wallet.amountUsdt')} htmlFor="checkout-deposit-amount">
                      <input
                        id="checkout-deposit-amount"
                        type="text"
                        inputMode="decimal"
                        value={amountInput}
                        onChange={(event) => {
                          setAmountInput(event.target.value);
                          setFieldError(null);
                        }}
                        data-testid="checkout-deposit-amount"
                      />
                    </FormField>

                    <fieldset className="wallet-payment-methods" data-testid="deposit-payment-methods">
                      <legend className="form-label">{t('wallet.paymentNetwork')}</legend>
                      <div className="wallet-payment-method-row">
                        {paymentMethods.map((method) => (
                          <label key={method} className="wallet-payment-method-option">
                            <input
                              type="radio"
                              name="deposit-payment-method"
                              value={method}
                              checked={checkoutPaymentMethod === method}
                              onChange={() => setCheckoutPaymentMethod(method)}
                              data-testid={`deposit-method-${method}`}
                            />
                            <span>{t(`wallet.paymentMethod.${method}`)}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {fieldError ? (
                      <p className="field-error" data-testid="checkout-deposit-field-error">
                        {fieldError}
                      </p>
                    ) : null}
                    {depositError ? <ErrorAlert error={depositError} /> : null}

                    <button
                      type="submit"
                      className="button primary"
                      disabled={submitting}
                      data-testid="checkout-deposit-submit"
                    >
                      {submitting ? t('wallet.depositRedirecting') : t('wallet.depositPayCta')}
                    </button>

                    {(depositStatus?.events.length ?? 0) > 0 ? (
                      <div className="wallet-crypto-history" data-testid="wallet-crypto-deposits">
                        <h4>{t('wallet.depositHistoryTitle')}</h4>
                        <ul className="wallet-crypto-list">
                          {depositStatus!.events.slice(0, 5).map((event) => (
                            <li key={event.id} data-testid={`deposit-event-${event.id}`}>
                              <span>{formatUsdFromMinor(event.amountMinor)}</span>
                              <span className="muted small">
                                {new Date(event.createdAt).toLocaleString(
                                  locale === 'en' ? 'en-US' : 'ru-RU',
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </form>
                ) : (
                  <div className="card wallet-deposit-form" data-testid="wallet-usdt-deposit">
                    <h3>{t('wallet.depositUsdtTitle')}</h3>
                    <ul className="wallet-crypto-warnings" data-testid="deposit-warnings">
                      {depositWarnings.map((warning) => (
                        <li key={warning} className="muted small">
                          {warning}
                        </li>
                      ))}
                    </ul>

                    {awaitingDeposit ? (
                      <p className="wallet-deposit-awaiting" data-testid="deposit-awaiting-status">
                        {t('wallet.depositAwaiting')}
                      </p>
                    ) : null}

                    {depositInfo?.address && depositInfo.qrData ? (
                      <div className="wallet-deposit-details">
                        <div className="wallet-deposit-qr-wrap">
                          <QrCode
                            value={depositInfo.qrData}
                            label={t('wallet.depositQrAlt')}
                            size={180}
                            className="wallet-deposit-qr"
                            testId="deposit-qr"
                          />
                        </div>
                        <FormField label={t('wallet.depositAddress')} htmlFor="deposit-trc20-address">
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
                              {addressCopied ? t('wallet.copied') : t('wallet.copy')}
                            </button>
                          </div>
                        </FormField>
                      </div>
                    ) : (
                      <p className="muted small">{t('wallet.depositAddressLoading')}</p>
                    )}

                    {(depositStatus?.events.length ?? 0) > 0 ? (
                      <div className="wallet-crypto-history" data-testid="wallet-crypto-deposits">
                        <h4>{t('wallet.depositHistoryTitle')}</h4>
                        <ul className="wallet-crypto-list">
                          {depositStatus!.events.slice(0, 5).map((event) => (
                            <li key={event.id} data-testid={`deposit-event-${event.id}`}>
                              <span>{formatUsdFromMinor(event.amountMinor)}</span>
                              <span className="muted small">
                                {new Date(event.createdAt).toLocaleString(
                                  locale === 'en' ? 'en-US' : 'ru-RU',
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )
              ) : !showDepositForm ? (
                <div className="card wallet-deposit-unavailable" data-testid="wallet-deposit-unavailable">
                  <p className="muted">{t('wallet.depositUnavailable')}</p>
                </div>
              ) : null}

              {showDepositForm ? (
                <form
                  className={`card form-card wallet-deposit-form${
                    cryptoPaymentsEnabled ? ' wallet-mock-deposit' : ''
                  }`}
                  onSubmit={(event) => void handleDeposit(event)}
                  data-testid="wallet-mock-deposit-form"
                >
                  <h3>{t('wallet.testDepositTitle')}</h3>
                  <p className="muted small">{t('wallet.testDepositBody')}</p>

                  <FormField label={t('wallet.amountUsdt')} htmlFor="deposit-amount-input">
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
                  <ErrorAlert error={depositError} />

                  <button
                    type="submit"
                    className={`button${cryptoPaymentsEnabled ? ' secondary' : ' primary'}`}
                    disabled={submitting}
                    data-testid="deposit-submit"
                  >
                    {submitting ? t('wallet.depositSubmitting') : t('wallet.depositSubmit')}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'withdraw' ? (
            <div className="wallet-tab-panel" data-testid="wallet-withdraw-panel">
              {cryptoPaymentsEnabled ? (
                <form
                  className="card form-card wallet-withdraw-form"
                  onSubmit={(event) => void handleWithdraw(event)}
                  data-testid="wallet-usdt-withdraw-form"
                >
                  <h3>{t('wallet.withdrawUsdtTitle')}</h3>
                  <p className="muted small">{t('wallet.withdrawUsdtBody')}</p>
                  <p className="wallet-withdraw-available muted small">
                    {t('wallet.withdrawAvailable', {
                      amount: formatUsdFromMinor(wallet.summary.availableMinor),
                    })}
                  </p>
                  {paymentMethods.length > 1 ? (
                    <fieldset className="wallet-payment-methods" data-testid="withdraw-payment-methods">
                      <legend className="form-label">{t('wallet.paymentNetwork')}</legend>
                      <div className="wallet-payment-method-row">
                        {paymentMethods.map((method) => (
                          <label key={method} className="wallet-payment-method-option">
                            <input
                              type="radio"
                              name="withdraw-payment-method"
                              value={method}
                              checked={withdrawPaymentMethod === method}
                              onChange={() => {
                                setWithdrawPaymentMethod(method);
                                setWithdrawError(null);
                              }}
                              data-testid={`withdraw-method-${method}`}
                            />
                            <span>{t(`wallet.paymentMethod.${method}`)}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <FormField
                    label={
                      withdrawPaymentMethod === 'trc20'
                        ? t('wallet.trc20Address')
                        : t('wallet.evmAddress')
                    }
                    htmlFor="withdraw-address-input"
                  >
                    <input
                      id="withdraw-address-input"
                      type="text"
                      placeholder={withdrawPaymentMethod === 'trc20' ? 'T...' : '0x...'}
                      value={withdrawAddress}
                      onChange={(event) => {
                        setWithdrawAddress(event.target.value);
                        setWithdrawError(null);
                      }}
                      data-testid="withdraw-address-input"
                    />
                  </FormField>
                  <FormField label={t('wallet.amountUsdt')} htmlFor="withdraw-amount-input">
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
                      <span className="muted small">{t('wallet.commission')}</span>
                      <strong>{formatUsdFromMinor(withdrawFeeMinor)}</strong>
                    </div>
                    <div>
                      <span className="muted small">{t('wallet.toReceive')}</span>
                      <strong data-testid="withdraw-net-amount">
                        {withdrawAmountMinor > withdrawFeeMinor
                          ? formatUsdFromMinor(withdrawNetMinor)
                          : '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="muted small">{t('wallet.minimum')}</span>
                      <strong>{formatUsdFromMinor(minWithdrawMinor)}</strong>
                    </div>
                  </div>
                  {withdrawError ? (
                    <p className="field-error" data-testid="withdraw-error">
                      {withdrawError}
                    </p>
                  ) : null}
                  {withdrawals.length > 0 ? (
                    <div className="wallet-crypto-history" data-testid="wallet-crypto-withdrawals">
                      <h4>{t('wallet.historyTitle')}</h4>
                      <ul className="wallet-crypto-list">
                        {withdrawals.slice(0, 10).map((item) => (
                          <li key={item.id} data-testid={`withdrawal-row-${item.id}`}>
                            <div className="wallet-withdrawal-row-main">
                              <span>{formatUsdFromMinor(item.amountMinor)}</span>
                              <span className="muted small">
                                {t('wallet.receivedAmount', {
                                  amount: formatUsdFromMinor(item.netMinor),
                                })}
                              </span>
                            </div>
                            <span
                              className={`wallet-withdrawal-status ${withdrawalStatusClass(item.status)}`}
                              data-testid={`withdrawal-status-${item.id}`}
                            >
                              {formatWithdrawalStatus(item.status, locale)}
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
                    {withdrawSubmitting ? t('wallet.withdrawSending') : t('wallet.withdrawSubmit')}
                  </button>
                </form>
              ) : (
                <div className="card wallet-withdraw-unavailable" data-testid="wallet-withdraw-unavailable">
                  <p className="muted">{t('wallet.withdrawUnavailable')}</p>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'transactions' && transactions.length === 0 ? (
            <EmptyState
              testId="wallet-transactions-empty"
              title={t('wallet.transactionsEmptyTitle')}
              message={t('wallet.transactionsEmptyMessage')}
              action={
                <button
                  type="button"
                  className="button primary"
                  data-testid="wallet-transactions-empty-deposit"
                  onClick={() => setActiveTab('deposit')}
                >
                  {t('wallet.transactionsEmptyDeposit')}
                </button>
              }
              secondaryAction={
                <Link to="/catalog" className="button secondary">
                  {t('wallet.toCatalog')}
                </Link>
              }
            />
          ) : null}

          {activeTab === 'transactions' && transactions.length > 0 ? (
            <div className="card wallet-transactions" data-testid="wallet-transactions">
              <h3>{t('wallet.transactionsTitle')}</h3>
              <div className="table-wrap">
                <table className="data-table" data-testid="wallet-transactions-table">
                  <thead>
                    <tr>
                      <th>{t('wallet.colType')}</th>
                      <th>{t('wallet.colAmount')}</th>
                      <th>{t('wallet.colDate')}</th>
                      <th>{t('wallet.colOrder')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const orderId = resolveLedgerOrderId(tx);
                      return (
                        <tr key={tx.id} data-testid={`wallet-tx-${tx.type}`}>
                          <td>{formatLedgerEntryType(tx.type, locale)}</td>
                          <td>
                            <span className={ledgerAmountClass(tx.amountMinor)}>
                              {formatLedgerAmount(tx.amountMinor)}
                            </span>
                          </td>
                          <td>
                            {new Date(tx.createdAt).toLocaleString(
                              locale === 'en' ? 'en-US' : 'ru-RU',
                            )}
                          </td>
                          <td>
                            {orderId ? (
                              <Link
                                to={`/orders/${orderId}`}
                                data-testid={`wallet-tx-order-${orderId}`}
                              >
                                {t('wallet.openOrder')}
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
        </>
      ) : null}
    </div>
  );
}
