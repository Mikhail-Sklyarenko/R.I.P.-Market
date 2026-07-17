import type { TradeTaskSummary } from '../api/types';
import {
  OFFER_ERROR_HINTS,
  requestExtensionPoll,
  TRADE_TASK_PHASE_LABELS,
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
  if (!tradeTask) {
    return (
      <p className="muted small" data-testid="extension-task-missing">
        Расширение ещё готовит задачу. Обновите страницу через несколько секунд.
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
    ? 'Проверяем доставку'
    : isTaskExpired
      ? 'Время истекло'
      : tradeTask.executionPhase
        ? (TRADE_TASK_PHASE_LABELS[tradeTask.executionPhase] ?? tradeTask.executionPhase)
        : tradeTask.attemptCount > 0 || tradeTask.lastErrorCode
          ? 'Повторяем отправку'
          : 'Готовим обмен';
  const errorHint = tradeTask.lastErrorCode
    ? (OFFER_ERROR_HINTS[tradeTask.lastErrorCode] ?? tradeTask.lastErrorCode)
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
          Предмет: <strong>{selectedItemName}</strong>
        </p>
      ) : null}
      {isConfirmPending ? (
        <p className="alert alert-success" data-testid="extension-task-confirm-pending">
          Откройте Steam Mobile и подтвердите отправку.
        </p>
      ) : null}
      {tradeTask.executionPhase === 'OFFER_SENT' ? (
        <p className="alert alert-success">
          Обмен отправлен. Дальше ждём покупателя в Steam.
        </p>
      ) : null}
      {isDeliveryCheck ? (
        <p className="alert alert-info" data-testid="extension-task-delivery-check">
          Предмет уже ушёл из инвентаря. Не создавайте новый offer — проверяем доставку.
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
        <p className="muted small">
          Оставьте вкладку Steam открытой под аккаунтом продавца.
        </p>
      ) : null}
      {showRetry ? (
        <button
          type="button"
          className="button secondary sm extension-task-retry"
          data-testid="extension-task-retry"
          onClick={() => void requestExtensionPoll()}
        >
          Повторить сейчас
        </button>
      ) : null}
      {manualFallbackVisible ? (
        <p className="muted small">
          Если автоотправка не сработала — откройте блок ниже и укажите offer вручную.
        </p>
      ) : null}
      <p className="muted small">
        Попытка {tradeTask.attemptCount} из {tradeTask.maxAttempts}
      </p>
    </div>
  );
}
