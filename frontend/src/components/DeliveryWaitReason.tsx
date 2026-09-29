import type { Order } from '../api/types';
import { useLocale } from '../i18n';

const reasons: Record<string, [string, string]> = {
  rate_limited: ['Steam временно ограничивает запросы. Проверка повторится автоматически.', 'Steam is temporarily limiting requests. Verification will retry automatically.'],
  INVENTORY_UNKNOWN_RETRY: ['Не удалось обновить инвентарь Steam. Средства остаются в резерве.', 'Steam inventory could not be refreshed. Funds remain reserved.'],
  STEAM_OFFER_UNAVAILABLE: ['Steam API пока не возвращает данные этого обмена. Средства остаются в резерве.', 'Steam API is not returning this offer yet. Funds remain reserved.'],
  STEAM_RECEIPT_MAPPING_UNAVAILABLE: ['Steam не вернул данные для проверки переданного предмета. Повторно отправлять обмен не нужно.', 'Steam did not return the data needed to verify the transferred item. Do not send another trade.'],
  STEAM_KEY_OWNER_UNVERIFIED: ['Площадка не может проверить этот обмен через настроенный доступ Steam. Требуется проверка со стороны сервиса.', 'The configured Steam access cannot verify this trade. The service needs to investigate.'],
  STEAM_API_KEY_MISSING: ['Серверная проверка Steam недоступна. Средства остаются в резерве.', 'Server Steam verification is unavailable. Funds remain reserved.'],
};
export function DeliveryWaitReason({ order }: { order: Order }) {
  const { locale } = useLocale();
  if (order.status !== 'WAITING_TRADE') return null;
  const code = order.deliveryProbe?.reasonCode;
  const copy = code ? reasons[code] : undefined;
  return copy ? <p className="alert alert-info" role="status">{copy[locale === 'ru' ? 0 : 1]}</p> : null;
}
