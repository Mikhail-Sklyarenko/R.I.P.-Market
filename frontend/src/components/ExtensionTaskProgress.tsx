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
        Задача расширения ещё не создана. Если покупатель только что оплатил — обновите
        страницу через несколько секунд.
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
  const phaseLabel = isTaskExpired
    ? 'Время истекло'
    : tradeTask.executionPhase
      ? (TRADE_TASK_PHASE_LABELS[tradeTask.executionPhase] ?? tradeTask.executionPhase)
      : tradeTask.attemptCount > 0 || tradeTask.lastErrorCode
        ? 'Повторная попытка'
        : 'Ожидает обработки';
  const errorHint = tradeTask.lastErrorCode
    ? (OFFER_ERROR_HINTS[tradeTask.lastErrorCode] ?? tradeTask.lastErrorCode)
    : null;
  const detailMessage = tradeTask.lastErrorMessage?.trim() || null;
  const selectedItemName =
    tradeTask.selectedMarketHashName?.trim() || itemMarketHashName?.trim() || null;
  const showRetry = !isTerminalSuccess && !isTerminalFailure;

  return (
    <div
      className={`extension-task-progress${isConfirmPending ? ' extension-task-progress--confirm-pending' : ''}`}
      data-testid="extension-task-progress"
    >
      <h4 className="order-trade-subtitle">Статус расширения</h4>
      <p data-testid="extension-task-phase">
        Фаза: <strong>{phaseLabel}</strong>
      </p>
      {isItemSelected && selectedItemName ? (
        <p className="muted small" data-testid="extension-task-selected-item">
          Предмет: <strong>{selectedItemName}</strong>
        </p>
      ) : null}
      <p className="muted small">
        Попытка {tradeTask.attemptCount} из {tradeTask.maxAttempts}
      </p>
      {isConfirmPending ? (
        <p className="alert alert-success" data-testid="extension-task-confirm-pending">
          Обмен создан. Подтвердите в Steam Guard на телефоне — это последний шаг для
          продавца.
        </p>
      ) : null}
      {tradeTask.executionPhase === 'OFFER_SENT' ? (
        <p className="alert alert-success">
          Обмен отправлен. Если Steam попросит — подтвердите в Guard на телефоне.
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
      {!isTerminalSuccess && !isTerminalFailure ? (
        <p className="muted small">
          Расширение обрабатывает сделку. Убедитесь, что вы залогинены в Steam в этом
          браузере.
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
          Если автоотправка не сработала — используйте ручной ввод offer ниже.
        </p>
      ) : null}
    </div>
  );
}
