import { useEffect, useState } from 'react';
import type { TradeTaskSummary } from '../api/types';
import { useLocale } from '../i18n';
import { formatGuardWaitElapsed } from '../utils/guard-wait';
import {
  formatExtensionTaskPhaseLabel,
  formatOfferErrorHint,
  getOfferErrorAction,
  requestExtensionPoll,
} from '../utils/extension';

type ExtensionTaskProgressProps = {
  tradeTask: TradeTaskSummary | null | undefined;
  manualFallbackVisible: boolean;
  itemMarketHashName?: string | null;
};

const RETRYABLE_DIAG_CODES = new Set([
  'INVENTORY_NOT_LOADED',
  'INVENTORY_PRIVATE',
  'INVENTORY_RATE_LIMITED',
  'STEAM_COOKIE_EXPIRED',
  'STEAM_UNAVAILABLE',
  'OFFER_SEND_FAILED',
]);

export function ExtensionTaskProgress({
  tradeTask,
  manualFallbackVisible,
  itemMarketHashName,
}: ExtensionTaskProgressProps) {
  const { t, locale } = useLocale();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const isConfirmPending =
    tradeTask?.executionPhase === 'CONFIRM_PENDING' ||
    Boolean(tradeTask?.confirmPending);

  useEffect(() => {
    if (!isConfirmPending) {
      return;
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isConfirmPending]);

  if (!tradeTask) {
    return (
      <p className="muted small" data-testid="extension-task-missing">
        {t('extensionTask.missing')}
      </p>
    );
  }

  const isTaskExpired = tradeTask.status === 'EXPIRED' || tradeTask.status === 'FAILED';
  const isItemSelected = tradeTask.executionPhase === 'ITEM_SELECTED';
  const isOfferSubmitted = tradeTask.executionPhase === 'OFFER_SUBMITTED';
  const isTerminalSuccess =
    (tradeTask.executionPhase === 'OFFER_SENT' && !isConfirmPending) ||
    tradeTask.executionPhase === 'CONFIRM_PENDING';
  const isTerminalFailure =
    tradeTask.executionPhase === 'OFFER_FAILED' || isTaskExpired;
  const isDeliveryCheck =
    tradeTask.lastErrorCode === 'ITEM_ALREADY_GONE' ||
    (isTerminalFailure && tradeTask.lastErrorCode === 'ITEM_MISSING');
  const phaseLabel = isDeliveryCheck
    ? t('extensionTask.checkingDelivery')
    : isTaskExpired
      ? t('extensionTask.timeExpired')
      : isConfirmPending
        ? formatExtensionTaskPhaseLabel('CONFIRM_PENDING', locale)
        : tradeTask.executionPhase
          ? formatExtensionTaskPhaseLabel(tradeTask.executionPhase, locale)
          : tradeTask.attemptCount > 0 || tradeTask.lastErrorCode
            ? t('extensionTask.retrying')
            : t('extensionTask.preparing');
  const errorCode = tradeTask.lastErrorCode?.trim() || null;
  const errorHint = errorCode ? formatOfferErrorHint(errorCode, locale) : null;
  const detailMessage = tradeTask.lastErrorMessage?.trim() || null;
  const selectedItemName =
    tradeTask.selectedMarketHashName?.trim() || itemMarketHashName?.trim() || null;
  const errorAction = errorCode ? getOfferErrorAction(errorCode) : null;
  const showRetry =
    !isDeliveryCheck &&
    !isConfirmPending &&
    !(tradeTask.executionPhase === 'OFFER_SENT' && !isConfirmPending) &&
    (Boolean(errorCode && RETRYABLE_DIAG_CODES.has(errorCode)) ||
      (!isTerminalFailure && !errorCode));
  const waitElapsed = isConfirmPending
    ? formatGuardWaitElapsed(tradeTask.confirmPendingSince, nowMs)
    : null;

  return (
    <div
      className={`extension-task-progress${isConfirmPending ? ' extension-task-progress--confirm-pending' : ''}`}
      data-testid="extension-task-progress"
    >
      <p data-testid="extension-task-phase">
        <strong>{phaseLabel}</strong>
      </p>
      {(isItemSelected || isOfferSubmitted || isConfirmPending) && selectedItemName ? (
        <p className="muted small" data-testid="extension-task-selected-item">
          {t('extensionTask.itemLabel')} <strong>{selectedItemName}</strong>
        </p>
      ) : null}
      {isConfirmPending ? (
        <div
          className="alert alert-success extension-guard-wait"
          data-testid="extension-task-confirm-pending"
        >
          <p>{t('extensionTask.confirmPending')}</p>
          <p className="muted small">{t('extensionTask.confirmPendingHint')}</p>
          {waitElapsed ? (
            <p className="extension-guard-timer" data-testid="extension-guard-timer">
              {t('extensionTask.confirmPendingTimer', { elapsed: waitElapsed })}
            </p>
          ) : (
            <p className="extension-guard-timer" data-testid="extension-guard-timer">
              {t('extensionTask.confirmPendingWaiting')}
            </p>
          )}
        </div>
      ) : null}
      {tradeTask.executionPhase === 'OFFER_SENT' && !isConfirmPending ? (
        <p className="alert alert-success" data-testid="extension-task-offer-sent">
          {t('extensionTask.offerSent')}
        </p>
      ) : null}
      {isDeliveryCheck ? (
        <p className="alert alert-info" data-testid="extension-task-delivery-check">
          {t('extensionTask.deliveryCheckBody')}
        </p>
      ) : null}
      {errorHint && !isTerminalFailure && !isConfirmPending ? (
        <p className="alert alert-warning" data-testid="extension-task-error">
          {errorHint}
          {detailMessage && detailMessage !== errorHint ? (
            <span className="muted small"> ({detailMessage})</span>
          ) : null}
        </p>
      ) : null}
      {isTerminalFailure && (errorHint || detailMessage) ? (
        <p className="alert alert-warning" data-testid="extension-task-error">
          {errorHint ?? detailMessage}
          {errorHint && detailMessage && detailMessage !== errorHint ? (
            <span className="muted small"> ({detailMessage})</span>
          ) : null}
        </p>
      ) : null}
      {errorCode && !isConfirmPending ? (
        <p className="muted small" data-testid="extension-task-error-code">
          {t('extensionTaskCta.supportCode')}: <code>{errorCode}</code>
        </p>
      ) : null}
      {errorAction && !isConfirmPending ? (
        <a
          className="button secondary sm"
          href={errorAction.href}
          target="_blank"
          rel="noreferrer"
          data-testid="extension-task-error-cta"
        >
          {t(errorAction.labelKey)}
        </a>
      ) : null}
      {!isTerminalSuccess && !isTerminalFailure && !isDeliveryCheck && !isConfirmPending ? (
        <p className="muted small">{t('extensionTask.keepTabOpen')}</p>
      ) : null}
      {showRetry ? (
        <button
          type="button"
          className="button secondary sm extension-task-retry"
          data-testid="extension-task-retry"
          onClick={() => void requestExtensionPoll()}
        >
          {t('extensionTask.retryNow')}
        </button>
      ) : null}
      {manualFallbackVisible ? (
        <p className="muted small">{t('extensionTask.manualFallbackHint')}</p>
      ) : null}
      <p className="muted small">
        {t('extensionTask.attemptCount', {
          current: tradeTask.attemptCount,
          max: tradeTask.maxAttempts,
        })}
      </p>
    </div>
  );
}
