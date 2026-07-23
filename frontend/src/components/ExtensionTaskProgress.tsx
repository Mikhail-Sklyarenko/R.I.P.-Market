import type { TradeTaskSummary } from '../api/types';
import { useLocale } from '../i18n';
import {
  formatExtensionTaskPhaseLabel,
  formatOfferErrorHint,
  requestExtensionPoll,
} from '../utils/extension';

type ExtensionTaskProgressProps = {
  tradeTask: TradeTaskSummary | null | undefined;
  manualFallbackVisible: boolean;
  itemMarketHashName?: string | null;
};

export function ExtensionTaskProgress({
  tradeTask,
  manualFallbackVisible,
  itemMarketHashName,
}: ExtensionTaskProgressProps) {
  const { t, locale } = useLocale();

  if (!tradeTask) {
    return (
      <p className="muted small" data-testid="extension-task-missing">
        {t('extensionTask.missing')}
      </p>
    );
  }

  const isTaskExpired = tradeTask.status === 'EXPIRED' || tradeTask.status === 'FAILED';
  const isConfirmPending = tradeTask.executionPhase === 'CONFIRM_PENDING';
  const isItemSelected = tradeTask.executionPhase === 'ITEM_SELECTED';
  const isTerminalSuccess =
    tradeTask.executionPhase === 'OFFER_SENT' || isConfirmPending;
  const isTerminalFailure =
    tradeTask.executionPhase === 'OFFER_FAILED' || isTaskExpired;
  const isDeliveryCheck =
    tradeTask.lastErrorCode === 'ITEM_ALREADY_GONE' ||
    (isTerminalFailure && tradeTask.lastErrorCode === 'ITEM_MISSING');
  const phaseLabel = isDeliveryCheck
    ? t('extensionTask.checkingDelivery')
    : isTaskExpired
      ? t('extensionTask.timeExpired')
      : tradeTask.executionPhase
        ? formatExtensionTaskPhaseLabel(tradeTask.executionPhase, locale)
        : tradeTask.attemptCount > 0 || tradeTask.lastErrorCode
          ? t('extensionTask.retrying')
          : t('extensionTask.preparing');
  const errorHint = tradeTask.lastErrorCode
    ? formatOfferErrorHint(tradeTask.lastErrorCode, locale)
    : null;
  const detailMessage = tradeTask.lastErrorMessage?.trim() || null;
  const selectedItemName =
    tradeTask.selectedMarketHashName?.trim() || itemMarketHashName?.trim() || null;
  const showRetry = !isTerminalSuccess && !isTerminalFailure && !isDeliveryCheck;

  return (
    <div
      className={`extension-task-progress${isConfirmPending ? ' extension-task-progress--confirm-pending' : ''}`}
      data-testid="extension-task-progress"
    >
      <p data-testid="extension-task-phase">
        <strong>{phaseLabel}</strong>
      </p>
      {isItemSelected && selectedItemName ? (
        <p className="muted small" data-testid="extension-task-selected-item">
          {t('extensionTask.itemLabel')} <strong>{selectedItemName}</strong>
        </p>
      ) : null}
      {isConfirmPending ? (
        <p className="alert alert-success" data-testid="extension-task-confirm-pending">
          {t('extensionTask.confirmPending')}
        </p>
      ) : null}
      {tradeTask.executionPhase === 'OFFER_SENT' ? (
        <p className="alert alert-success">{t('extensionTask.offerSent')}</p>
      ) : null}
      {isDeliveryCheck ? (
        <p className="alert alert-info" data-testid="extension-task-delivery-check">
          {t('extensionTask.deliveryCheckBody')}
        </p>
      ) : null}
      {errorHint && !isTerminalFailure ? (
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
      {!isTerminalSuccess && !isTerminalFailure && !isDeliveryCheck ? (
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
