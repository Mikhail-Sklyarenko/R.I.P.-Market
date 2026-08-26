/**
 * D8: Pre-list safety — soft gate, Steam eligibility, active deal/trade-task,
 * and validation of POST /inventory/:id/check before create.
 */

export type PrelistBlockReason =
  | 'disconnected'
  | 'site_offline'
  | 'active_trade_task'
  | 'in_deal'
  | 'listed'
  | 'not_available'
  | 'trade_locked'
  | 'not_tradable'
  | 'not_marketable'
  | 'not_listable_type';

export type PrelistSafetyResult = {
  canList: boolean;
  softGate: boolean;
  reason: PrelistBlockReason | null;
  label: string | null;
  message: string | null;
  orderUrl: string | null;
};

export type CheckedInventoryAssetLike = {
  status?: string | null;
  tradable?: boolean | null;
  marketable?: boolean | null;
  tradeLockUntil?: string | null;
  itemDefinition?: { marketHashName?: string | null } | null;
};

/** Mirrors site/backend non-listable collectibles (medals/coins/badges). */
const NON_LISTABLE_NAME_RE =
  /(?:Service Medal|Veteran Coin|Birthday Coin|Global Offensive Badge|Loyalty Badge|Premier Season|Operation Coin|Ten Year Veteran)/i;

export const PRELIST_SOFT_GATE_MESSAGE =
  'Сначала подключите расширение на сайте (Account → Подключить) — иначе выставить предмет нельзя.';

export const PRELIST_SITE_OFFLINE_MESSAGE =
  'Сайт недоступен или связь нестабильна — выставка временно отключена (безопасный режим).';

export function isListableMarketHashName(
  marketHashName: string | null | undefined,
): boolean {
  const normalized = marketHashName?.trim() ?? '';
  if (!normalized) {
    return false;
  }
  return !NON_LISTABLE_NAME_RE.test(normalized);
}

export function isTradeLocked(
  tradeLockUntil: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!tradeLockUntil) {
    return false;
  }
  const until = Date.parse(tradeLockUntil);
  return Number.isFinite(until) && until > nowMs;
}

/**
 * UI-side preflight before opening create / enabling bulk select.
 * Manage path is separate (listed ACTIVE) — this answers “can create a new lot?”.
 */
export function evaluatePrelistSafety(params: {
  connected: boolean;
  /** H4: site unreachable / degraded — block list even if paired. */
  siteSafeMode?: boolean;
  steam: {
    tradable: boolean;
    marketable: boolean;
    tradeLockUntil: string | null;
    marketHashName?: string | null;
  };
  platform?: {
    listed?: boolean;
    inActiveDeal?: boolean;
    hasActiveTradeTask?: boolean;
    assetStatus?: string | null;
    orderUrl?: string | null;
    lotUrl?: string | null;
  } | null;
  nowMs?: number;
}): PrelistSafetyResult {
  if (!params.connected) {
    return {
      canList: false,
      softGate: true,
      reason: 'disconnected',
      label: 'Подключить',
      message: PRELIST_SOFT_GATE_MESSAGE,
      orderUrl: null,
    };
  }

  if (params.siteSafeMode) {
    return {
      canList: false,
      softGate: true,
      reason: 'site_offline',
      label: 'Сайт offline',
      message: PRELIST_SITE_OFFLINE_MESSAGE,
      orderUrl: null,
    };
  }

  const platform = params.platform;
  if (platform?.hasActiveTradeTask) {
    return {
      canList: false,
      softGate: false,
      reason: 'active_trade_task',
      label: 'Обмен идёт',
      message:
        'По этому предмету уже идёт задача обмена R.I.P — дождитесь завершения, затем выставляйте снова.',
      orderUrl: platform.orderUrl ?? null,
    };
  }

  if (platform?.inActiveDeal || platform?.assetStatus === 'RESERVED') {
    return {
      canList: false,
      softGate: false,
      reason: 'in_deal',
      label: 'В сделке',
      message: 'Предмет в активной сделке — выставить нельзя.',
      orderUrl: platform.orderUrl ?? platform.lotUrl ?? null,
    };
  }

  if (platform?.listed || platform?.assetStatus === 'LISTED') {
    return {
      canList: false,
      softGate: false,
      reason: 'listed',
      label: 'Уже на R.I.P',
      message: 'Этот предмет уже выставлен на площадке.',
      orderUrl: platform.lotUrl ?? null,
    };
  }

  if (
    platform?.assetStatus &&
    platform.assetStatus !== 'AVAILABLE' &&
    platform.assetStatus !== 'LISTED' &&
    platform.assetStatus !== 'RESERVED'
  ) {
    return {
      canList: false,
      softGate: false,
      reason: 'not_available',
      label: 'Недоступен',
      message: `Статус на площадке: ${platform.assetStatus} — выставить нельзя.`,
      orderUrl: null,
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  if (isTradeLocked(params.steam.tradeLockUntil, nowMs)) {
    return {
      canList: false,
      softGate: false,
      reason: 'trade_locked',
      label: 'Trade-lock',
      message: 'Дождитесь снятия trade-lock, затем выставляйте.',
      orderUrl: null,
    };
  }

  if (!params.steam.tradable) {
    return {
      canList: false,
      softGate: false,
      reason: 'not_tradable',
      label: 'Не tradable',
      message: 'Предмет нельзя обменять — выставить на R.I.P нельзя.',
      orderUrl: null,
    };
  }

  if (!params.steam.marketable) {
    return {
      canList: false,
      softGate: false,
      reason: 'not_marketable',
      label: 'Не marketable',
      message: 'Предмет не marketable — выставить на R.I.P нельзя.',
      orderUrl: null,
    };
  }

  if (
    params.steam.marketHashName != null &&
    !isListableMarketHashName(params.steam.marketHashName)
  ) {
    return {
      canList: false,
      softGate: false,
      reason: 'not_listable_type',
      label: 'Нельзя list',
      message: 'Этот тип предмета нельзя выставить на R.I.P (медаль/значок и т.п.).',
      orderUrl: null,
    };
  }

  return {
    canList: true,
    softGate: false,
    reason: null,
    label: null,
    message: null,
    orderUrl: null,
  };
}

/**
 * Hard gate after POST /inventory/:id/check — mirrors canListAsset + name rules.
 */
export function evaluateCheckedInventoryAsset(
  asset: CheckedInventoryAssetLike | null | undefined,
  nowMs = Date.now(),
): { ok: boolean; error: string | null } {
  if (!asset) {
    return { ok: false, error: 'Площадка не вернула предмет после проверки.' };
  }
  if (asset.status && asset.status !== 'AVAILABLE') {
    return {
      ok: false,
      error: `Предмет недоступен для выставки (статус ${asset.status}).`,
    };
  }
  if (asset.tradable === false) {
    return { ok: false, error: 'Предмет не tradable — выставить нельзя.' };
  }
  if (asset.marketable === false) {
    return { ok: false, error: 'Предмет не marketable — выставить нельзя.' };
  }
  if (isTradeLocked(asset.tradeLockUntil, nowMs)) {
    return {
      ok: false,
      error: 'Предмет под trade-lock — дождитесь снятия блокировки.',
    };
  }
  const name = asset.itemDefinition?.marketHashName ?? null;
  if (!isListableMarketHashName(name)) {
    return {
      ok: false,
      error: 'Этот тип предмета нельзя выставить на R.I.P.',
    };
  }
  return { ok: true, error: null };
}
