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

export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Проверьте форму и повторите попытку.',
  UNAUTHORIZED: 'Войдите в аккаунт для продолжения.',
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
  STEAM_AUTH_FAILED: 'Не удалось войти через Steam. Попробуйте ещё раз.',
  STEAM_ALREADY_LINKED:
    'Этот Steam-аккаунт уже привязан к другому пользователю. Войдите в аккаунт, где Steam уже привязан.',
  STEAM_NOT_LINKED:
    'Привяжите Steam-аккаунт на странице «Аккаунт» перед синхронизацией инвентаря.',
  STEAM_PROFILE_PRIVATE:
    'Инвентарь Steam скрыт. Откройте его в настройках приватности Steam.',
  INVENTORY_STALE: 'Не удалось обновить инвентарь из Steam. Попробуйте чуть позже.',
};

export const USER_ROLE_LABELS: Record<string, string> = {
  BUYER: 'Покупатель',
  SELLER: 'Продавец',
  ADMIN: 'Админ',
};

export const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Активен',
  SUSPENDED: 'Приостановлен',
  BANNED: 'Заблокирован',
};

export function formatUserRole(role?: string | null): string {
  if (!role) {
    return '—';
  }
  return USER_ROLE_LABELS[role] ?? role;
}

export function formatUserStatus(status?: string | null): string {
  if (!status) {
    return '—';
  }
  return USER_STATUS_LABELS[status] ?? status;
}

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

export function formatTradeStatus(status?: string | null): string {
  if (!status) {
    return '—';
  }
  return TRADE_STATUS_LABELS[status] ?? status;
}

export const BUYER_CANCELABLE_STATUSES = new Set([
  'CREATED',
  'PAYMENT_RESERVED',
  'WAITING_TRADE',
]);

export function getHomePathForRole(role: string): string {
  if (role === 'SELLER') {
    return '/sell/inventory';
  }
  if (role === 'ADMIN') {
    return '/admin/orders';
  }
  return '/catalog';
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
): string {
  if (errorCode && ERROR_MESSAGES[errorCode]) {
    return ERROR_MESSAGES[errorCode];
  }
  if (messageParam) {
    return messageParam;
  }
  if (errorCode) {
    return errorCode;
  }
  return 'Не удалось завершить вход через Steam.';
}

export type SteamCallbackAction = {
  label: string;
  href: string;
};

export function getSteamCallbackActions(errorCode: string | null): SteamCallbackAction[] {
  if (errorCode === 'STEAM_ALREADY_LINKED') {
    return [
      { label: 'Войти в другой аккаунт', href: '/login' },
      { label: 'Открыть аккаунт', href: '/account' },
    ];
  }

  return [{ label: 'Вернуться ко входу', href: '/login' }];
}

export const MOCK_TRADE_ENABLED = viteEnv?.VITE_ENABLE_MOCK_TRADE !== 'false';

export const IS_STAGING = viteEnv?.VITE_STAGING === 'true';

/** Mock trade / mock deposit UI — hidden on staging for non-admin users. */
export function canShowDevPanels(role?: string | null): boolean {
  if (!IS_STAGING) {
    return true;
  }
  return role === 'ADMIN';
}
