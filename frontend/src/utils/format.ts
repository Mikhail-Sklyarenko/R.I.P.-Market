import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import { translate } from '../i18n/translate.ts';
import type { Locale } from '../i18n/types.ts';

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function t(key: string, locale: Locale, params?: Record<string, string | number>) {
  return translate(messagesByLocale[locale], key, params);
}

export function formatUsdFromMinor(minor: string | number): string {
  const value = typeof minor === 'string' ? Number(minor) : minor;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value / 100);
}

/** Display USDT in crypto wallet UI; ledger still stores USD minor (1 USDT = 1 USD). */
export function formatUsdtFromMinor(minor: string | number): string {
  const value = typeof minor === 'string' ? Number(minor) : minor;
  const amount = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
  return `${amount} USDT`;
}

export function parseUsdToMinor(input: string): number | null {
  const normalized = input.replace(/[^0-9.]/g, '');
  if (!normalized) {
    return null;
  }
  const dollars = Number(normalized);
  if (!Number.isFinite(dollars) || dollars <= 0) {
    return null;
  }
  return Math.round(dollars * 100);
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  return fallback;
}

/** @deprecated Prefer formatApiErrorMessage(code, locale) — RU snapshot kept for older callers/tests. */
export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Проверьте форму и повторите попытку.',
  UNAUTHORIZED: 'Сессия устарела. Выйдите и войдите снова.',
  FORBIDDEN: 'У вас нет прав на это действие.',
  NOT_FOUND: 'Запрашиваемый объект не найден.',
  BAD_REQUEST: 'Сейчас это действие недоступно.',
  INTERNAL_ERROR: 'Внутренняя ошибка сервера. Попробуйте позже.',
  INVENTORY_ASSET_NOT_AVAILABLE: 'Предмет недоступен для выставления.',
  INVENTORY_ASSET_NOT_TRADABLE: 'Предмет сейчас нельзя обменять.',
  INVENTORY_ASSET_TRADE_LOCKED: 'Предмет в trade-lock.',
  INVENTORY_ASSET_NOT_FOUND: 'Предмет не найден в инвентаре.',
  LOT_ALREADY_EXISTS_FOR_ASSET: 'Для этого предмета уже есть активный лот.',
  SELLER_NOT_ACTIVE: 'Аккаунт продавца не активен.',
  INSUFFICIENT_BALANCE: 'Недостаточно средств. Пополните кошелёк.',
  LOT_NOT_ACTIVE: 'Лот больше недоступен для покупки.',
  LOT_NOT_FOUND: 'Лот не найден.',
  CANNOT_BUY_OWN_LOT: 'Нельзя купить свой собственный лот.',
  LOT_HAS_OPEN_ORDER: 'Этот лот уже покупают.',
  BUYER_NOT_ACTIVE: 'Аккаунт покупателя не активен.',
  ORDER_NOT_FOUND: 'Сделка не найдена.',
  IDEMPOTENCY_KEY_REQUIRED: 'Не удалось выполнить запрос. Обновите страницу и повторите.',
  STEAM_AUTH_FAILED:
    'Не удалось войти через Steam. Если ошибка повторяется — Steam может временно блокировать сервер; используйте Mock-вход или попробуйте позже.',
  STEAM_ALREADY_LINKED:
    'Этот Steam-аккаунт уже привязан к другому пользователю. Войдите в аккаунт, где Steam уже привязан.',
  STEAM_NOT_LINKED:
    'Привяжите Steam-аккаунт на странице «Аккаунт» перед синхронизацией инвентаря.',
  STEAM_PROFILE_PRIVATE:
    'Инвентарь Steam скрыт. Откройте его в настройках приватности Steam.',
  STEAM_BLOCKED:
    'Steam временно блокирует запросы с сервера. Это не настройки приватности — кэш инвентаря доступен; цены и обновление могут не работать.',
  INVENTORY_STALE: 'Не удалось обновить инвентарь из Steam. Попробуйте чуть позже.',
  TRADE_URL_REQUIRED:
    'Укажите Trade URL в настройках аккаунта — без него нельзя продавать и покупать.',
  STEAM_VAC_BANNED:
    'Аккаунт с VAC-баном не может торговать на площадке.',
};

/** Locale-aware API error formatter — falls back to raw code if no translation exists. */
export function formatApiErrorMessage(code: string, locale: Locale = 'ru'): string {
  const key = `apiError.${code}`;
  const translated = t(key, locale);
  if (translated !== key) {
    return translated;
  }
  return ERROR_MESSAGES[code] ?? code;
}

/** @deprecated Prefer formatUserRole(role, locale) */
export const USER_ROLE_LABELS: Record<string, string> = {
  BUYER: 'Покупатель',
  SELLER: 'Продавец',
  ADMIN: 'Админ',
};

/** @deprecated Prefer formatUserStatus(status, locale) */
export const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Активен',
  SUSPENDED: 'Приостановлен',
  BANNED: 'Заблокирован',
};

export function formatUserRole(role?: string | null, locale: Locale = 'ru'): string {
  if (!role) {
    return '—';
  }
  const key = `userRole.${role}`;
  const translated = t(key, locale);
  if (translated !== key) {
    return translated;
  }
  return USER_ROLE_LABELS[role] ?? role;
}

export function formatUserStatus(status?: string | null, locale: Locale = 'ru'): string {
  if (!status) {
    return '—';
  }
  const key = `userStatus.${status}`;
  const translated = t(key, locale);
  if (translated !== key) {
    return translated;
  }
  return USER_STATUS_LABELS[status] ?? status;
}

/** @deprecated Prefer formatTradeStatus(status, locale) */
export const TRADE_STATUS_LABELS: Record<string, string> = {
  WAITING: 'Ожидание обмена',
  CONFIRMED: 'Обмен подтверждён',
  FAILED_SAFE: 'Неудача (возврат)',
  FAILED_DISPUTE: 'Неудача (спор)',
  TIMEOUT: 'Истекло время',
};

const viteEnv =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : undefined;

export const SUPPORT_EMAIL =
  (typeof viteEnv?.VITE_SUPPORT_EMAIL === 'string' && viteEnv.VITE_SUPPORT_EMAIL.trim()) ||
  'support@ripmarket.example';

export function formatTradeStatus(status?: string | null, locale: Locale = 'ru'): string {
  if (!status) {
    return '—';
  }
  const key = `tradeStatus.${status}`;
  const translated = t(key, locale);
  if (translated !== key) {
    return translated;
  }
  return TRADE_STATUS_LABELS[status] ?? status;
}

export const BUYER_CANCELABLE_STATUSES = new Set([
  'CREATED',
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
]);

export function getHomePathForRole(role: string): string {
  if (role === 'ADMIN') {
    return '/admin/orders';
  }
  return '/';
}

export const OPEN_DISPUTE_STATUSES = new Set([
  'CREATED',
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
  'TRADE_CONFIRMED',
]);

export function getSteamCallbackMessage(
  errorCode: string | null,
  messageParam: string | null,
  locale: Locale = 'ru',
): string {
  // Prefer server-provided Russian messages (e.g. IP block) over the generic map,
  // but only when the UI itself is in Russian.
  if (locale === 'ru' && messageParam && /[А-Яа-яЁё]/.test(messageParam)) {
    return messageParam;
  }
  if (errorCode && (t(`apiError.${errorCode}`, locale) !== `apiError.${errorCode}` || ERROR_MESSAGES[errorCode])) {
    return formatApiErrorMessage(errorCode, locale);
  }
  if (messageParam) {
    return messageParam;
  }
  if (errorCode) {
    return errorCode;
  }
  return t('steamCallback.defaultError', locale);
}

export type SteamCallbackAction = {
  label: string;
  href: string;
};

export function getSteamCallbackActions(
  errorCode: string | null,
  locale: Locale = 'ru',
): SteamCallbackAction[] {
  if (errorCode === 'STEAM_ALREADY_LINKED') {
    return [
      { label: t('steamCallback.homeAction', locale), href: '/' },
      { label: t('steamCallback.accountAction', locale), href: '/account' },
    ];
  }

  return [{ label: t('steamCallback.catalogAction', locale), href: '/' }];
}

export const MOCK_TRADE_ENABLED = viteEnv?.VITE_ENABLE_MOCK_TRADE !== 'false';

export const IS_STAGING = viteEnv?.VITE_STAGING === 'true';

/** Show mock deposit on closed QA staging (p2pcs.ru) for all logged-in testers. */
export const QA_MOCK_DEPOSIT_ENABLED = viteEnv?.VITE_QA_MOCK_DEPOSIT === 'true';

/** Mock trade / mock deposit UI — hidden on staging for non-admin users. */
export function canShowDevPanels(role?: string | null): boolean {
  if (!IS_STAGING) {
    return true;
  }
  return role === 'ADMIN';
}

export function canShowMockDepositPanel(role?: string | null): boolean {
  if (QA_MOCK_DEPOSIT_ENABLED) {
    return true;
  }
  return canShowDevPanels(role);
}
