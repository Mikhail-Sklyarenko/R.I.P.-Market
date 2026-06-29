export const SELLER_SALE_STEPS = [
  'Выставляете предмет и указываете цену.',
  'Покупатель резервирует средства — лот переходит в RESERVED.',
  'Вы отправляете trade offer в Steam покупателю.',
  'После подтверждения обмена получаете выплату за вычетом комиссии 5%.',
] as const;

export const ASSET_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Доступен',
  LISTED: 'Выставлен',
  RESERVED: 'В сделке',
  SOLD: 'Продан',
  BLOCKED: 'Заблокирован',
  REMOVED: 'Удалён',
};

export function formatAssetStatus(status: string): string {
  return ASSET_STATUS_LABELS[status] ?? status;
}

export function canListAsset(asset: {
  status: string;
  tradable: boolean;
  tradeLockUntil?: string | null;
}): boolean {
  if (asset.status !== 'AVAILABLE') {
    return false;
  }
  if (!asset.tradable) {
    return false;
  }
  if (asset.tradeLockUntil && new Date(asset.tradeLockUntil) > new Date()) {
    return false;
  }
  return true;
}

export function assetUnavailableReason(asset: {
  status: string;
  tradable: boolean;
  tradeLockUntil?: string | null;
}): string {
  if (asset.status === 'LISTED') {
    return 'Уже выставлен на продажу';
  }
  if (asset.status === 'RESERVED') {
    return 'Предмет в активной сделке';
  }
  if (asset.status === 'SOLD') {
    return 'Предмет уже продан';
  }
  if (asset.status === 'BLOCKED') {
    return 'Предмет заблокирован';
  }
  if (asset.status !== 'AVAILABLE') {
    return `Статус: ${formatAssetStatus(asset.status)}`;
  }
  if (!asset.tradable) {
    return 'Нельзя обменять';
  }
  if (asset.tradeLockUntil && new Date(asset.tradeLockUntil) > new Date()) {
    return `Trade-lock до ${new Date(asset.tradeLockUntil).toLocaleString()}`;
  }
  return 'Недоступен';
}
