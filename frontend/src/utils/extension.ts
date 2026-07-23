import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale) {
  return translate(messagesByLocale[locale], key);
}

export type ExtensionPublicConfig = {
  extensionChannelEnabled: boolean;
  extensionTaskPipelineEnabled: boolean;
  extensionFirstTradeFlowEnabled: boolean;
  extensionUiTradeFlowEnabled: boolean;
  extensionTradeAcknowledgmentEnabled: boolean;
  settlementHoldWindowEnabled: boolean;
  extensionRolloutEnabled: boolean;
  extensionRolloutStage: string;
  extensionRolloutKillSwitch: boolean;
};

export type ExtensionRuntimeStatus = {
  connected: boolean;
  sessionId?: string;
  expiresAt?: string;
  apiBaseUrl?: string;
};

type ChromeRuntime = {
  runtime?: {
    sendMessage: (
      extensionId: string,
      message: Record<string, unknown>,
      callback?: (response: unknown) => void,
    ) => void;
    lastError?: { message?: string };
  };
};

function getChrome(): ChromeRuntime | undefined {
  return (globalThis as { chrome?: ChromeRuntime }).chrome;
}

export function getExtensionId(): string | undefined {
  const value = import.meta.env.VITE_EXTENSION_ID;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function isExtensionRuntimeAvailable(): boolean {
  return Boolean(getExtensionId() && getChrome()?.runtime?.sendMessage);
}

function sendExtensionMessage<T>(message: Record<string, unknown>): Promise<T> {
  const extensionId = getExtensionId();
  const chromeApi = getChrome();
  if (!extensionId || !chromeApi?.runtime?.sendMessage) {
    return Promise.reject(new Error('EXTENSION_NOT_INSTALLED'));
  }
  return new Promise((resolve, reject) => {
    chromeApi.runtime!.sendMessage!(extensionId, message, (response) => {
      const lastError = chromeApi.runtime?.lastError;
      if (lastError?.message) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

export async function getExtensionRuntimeStatus(): Promise<ExtensionRuntimeStatus> {
  if (!isExtensionRuntimeAvailable()) {
    return { connected: false };
  }
  try {
    return await sendExtensionMessage<ExtensionRuntimeStatus>({
      type: 'RIP_MARKET_STATUS',
    });
  } catch {
    return { connected: false };
  }
}

export async function pairExtension(
  userJwt: string,
  locale: Locale = 'ru',
): Promise<
  | { ok: true; sessionId?: string }
  | { ok: false; error: string }
> {
  if (!isExtensionRuntimeAvailable()) {
    return {
      ok: false,
      error: t('extension.notInstalled', locale),
    };
  }
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
  try {
    const response = await sendExtensionMessage<{
      ok?: boolean;
      sessionId?: string;
      error?: string;
    }>({
      type: 'RIP_MARKET_PAIR',
      userJwt,
      apiBaseUrl,
    });
    if (response?.ok) {
      return { ok: true, sessionId: response.sessionId };
    }
    return {
      ok: false,
      error: response?.error ?? t('extension.pairFailedGeneric', locale),
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : t('extension.connectionError', locale);
    const friendly =
      raw.includes('Receiving end does not exist') ||
      raw.includes('Could not establish connection')
        ? t('extension.notFoundHint', locale)
        : raw;
    return {
      ok: false,
      error: friendly,
    };
  }
}

export async function disconnectExtension(): Promise<void> {
  if (!isExtensionRuntimeAvailable()) {
    return;
  }
  await sendExtensionMessage({ type: 'RIP_MARKET_DISCONNECT' });
}

export async function requestExtensionPoll(): Promise<void> {
  if (!isExtensionRuntimeAvailable()) {
    return;
  }
  try {
    await sendExtensionMessage({ type: 'RIP_MARKET_POLL_NOW' });
  } catch {
    // Extension may be busy or disconnected.
  }
}

export function formatExtensionUiTradeFlowLabel(
  enabled: boolean,
  locale: Locale = 'ru',
): string {
  return t(enabled ? 'extensionUiFlow.uiTrade' : 'extensionUiFlow.apiFallback', locale);
}

export function formatExtensionTaskPhaseLabel(phase: string, locale: Locale = 'ru'): string {
  const label = t(`extensionTaskPhase.${phase}`, locale);
  return label === `extensionTaskPhase.${phase}` ? phase : label;
}

export function formatOfferErrorHint(code: string, locale: Locale = 'ru'): string {
  const label = t(`offerErrorHint.${code}`, locale);
  return label === `offerErrorHint.${code}` ? code : label;
}

/** @deprecated Prefer formatExtensionTaskPhaseLabel(phase, locale) */
export const TRADE_TASK_PHASE_LABELS: Record<string, string> = {
  ACKED: 'Расширение взяло задачу',
  TRADE_PAGE_OPENED: 'Открыли страницу обмена',
  OFFER_DRAFTED: 'Готовим обмен',
  ITEM_SELECTED: 'Добавили предмет',
  OFFER_SUBMITTED: 'Отправляем обмен',
  CONFIRM_PENDING: 'Подтвердите в Steam Guard',
  OFFER_SENT: 'Обмен отправлен',
  OFFER_FAILED: 'Не удалось отправить',
};

/** @deprecated Prefer formatOfferErrorHint(code, locale) */
export const OFFER_ERROR_HINTS: Record<string, string> = {
  BUYER_TRADE_URL_INVALID: 'Попросите покупателя обновить Trade URL.',
  BUYER_TRADE_URL_MISSING: 'У покупателя нет Trade URL в профиле.',
  ITEM_MISSING:
    'Предмет не найден в Steam. Если обмен уже ушёл — дождитесь проверки доставки, не отправляйте новый offer.',
  ITEM_ALREADY_GONE:
    'Похоже, обмен уже прошёл в Steam. Не отправляйте новый offer — платформа проверяет доставку покупателю.',
  ITEM_MISMATCH:
    'В инвентаре несколько одинаковых скинов — укажите offer вручную или пересоздайте лот.',
  INVENTORY_NOT_LOADED:
    'Не удалось загрузить инвентарь Steam. Откройте steamcommunity.com в этом Chrome и обновите страницу сделки.',
  STEAM_ACCOUNT_MISMATCH:
    'В Chrome залогинен другой Steam-аккаунт. Войдите под продавцом или подключите расширение в нужном профиле.',
  STEAM_UNAVAILABLE: 'Steam временно недоступен.',
  STEAM_GUARD_REQUIRED: 'Подтвердите обмен в Steam Mobile.',
  CONFIRM_PENDING: 'Ожидается подтверждение в Steam Guard.',
  OFFER_SEND_FAILED: 'Не удалось отправить обмен — попробуйте вручную.',
  OFFER_DRAFT_FAILED: 'Не удалось подготовить обмен в Steam.',
  TRADE_HOLD_BLOCKED:
    'Steam не позволяет отправить обмен из-за trade hold. Подождите снятия ограничения или отправьте вручную.',
  SESSION_REVOKED:
    'Сессия расширения истекла. Откройте «Аккаунт» и нажмите «Подключить расширение» снова.',
  STALE_ORDER_SUPERSEDED:
    'Эта сделка устарела — есть более новый заказ. Откройте актуальную сделку в «Мои сделки».',
  MAX_ATTEMPTS_REACHED:
    'Автоотправка исчерпала попытки. Отправьте offer вручную по ссылке ниже.',
  TASK_TTL_EXPIRED:
    'Время автоотправки истекло. Обновите страницу — задача возобновится автоматически.',
};
