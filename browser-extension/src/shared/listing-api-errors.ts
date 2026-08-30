/**
 * Map listing/trade API failures to honest RU copy for the extension UI.
 * Never present a transient ban-check outage as «у вас VAC».
 */

export type ListingApiErrorLike = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

const MESSAGES_RU: Record<string, string> = {
  STEAM_VAC_BANNED: 'Аккаунт с VAC-баном не может торговать на площадке.',
  STEAM_GAME_BANNED:
    'Аккаунт с игровым баном Steam не может торговать на площадке.',
  STEAM_BAN_CHECK_UNAVAILABLE:
    'Не удалось проверить статус банов Steam — это не бан. Повторите через минуту.',
  TRADE_URL_REQUIRED:
    'Укажите Trade URL в настройках аккаунта — без него нельзя продавать.',
  TRADE_URL_STEAM_MISMATCH:
    'Trade URL не принадлежит привязанному Steam-аккаунту.',
  INVENTORY_ASSET_NOT_TRADABLE: 'Предмет сейчас нельзя обменять.',
  INVENTORY_ASSET_TRADE_LOCKED: 'Предмет в trade-lock Steam.',
  INVENTORY_ASSET_NOT_AVAILABLE: 'Предмет недоступен для выставления.',
  INVENTORY_ASSET_NOT_FOUND: 'Предмет не найден в инвентаре площадки.',
  LOT_ALREADY_EXISTS_FOR_ASSET: 'Для этого предмета уже есть активный лот.',
  SELLER_NOT_ACTIVE: 'Аккаунт продавца не активен.',
  EXTENSION_SESSION_REVOKED:
    'Сессия расширения истекла. Подключите снова на странице аккаунта.',
  EXTENSION_TOKEN_EXPIRED:
    'Сессия расширения истекла. Подключите снова на странице аккаунта.',
};

const HARD_BAN_CODES = new Set(['STEAM_VAC_BANNED', 'STEAM_GAME_BANNED']);

export function isHardSteamTradeBanCode(code: string | null | undefined): boolean {
  return Boolean(code && HARD_BAN_CODES.has(code));
}

export function isRetryableBanCheckCode(
  code: string | null | undefined,
): boolean {
  return code === 'STEAM_BAN_CHECK_UNAVAILABLE';
}

/**
 * Prefer structured `code`; fall back to legacy English payloads from older backends.
 */
export function humanizeListingApiError(error: ListingApiErrorLike): string {
  const code = error.code?.trim() || null;
  if (code && MESSAGES_RU[code]) {
    return MESSAGES_RU[code];
  }

  const raw = (error.message ?? '').trim();
  if (/Unable to verify VAC|Unable to verify Steam ban|ban check is required/i.test(raw)) {
    return MESSAGES_RU.STEAM_BAN_CHECK_UNAVAILABLE;
  }
  if (/VAC ban/i.test(raw) && !/Unable to verify/i.test(raw)) {
    return MESSAGES_RU.STEAM_VAC_BANNED;
  }
  if (/game ban/i.test(raw)) {
    return MESSAGES_RU.STEAM_GAME_BANNED;
  }

  // Strip orchestrator wrapper: "Extension API /lots failed: 503 …"
  const stripped = raw.replace(
    /^Extension API\s+\S+\s+failed:\s+\d+\s+/i,
    '',
  );
  if (stripped && stripped !== raw) {
    if (/Unable to verify VAC|Unable to verify Steam ban/i.test(stripped)) {
      return MESSAGES_RU.STEAM_BAN_CHECK_UNAVAILABLE;
    }
    return stripped;
  }

  return raw || 'Не удалось выполнить действие. Попробуйте ещё раз.';
}
