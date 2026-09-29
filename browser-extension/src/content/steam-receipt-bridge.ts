import { RECEIPT_CONTEXT_KEY, readReceiptContext } from '../shared/steam-receipt-context.js';
import { TRADE_VERIFICATION_RUNTIME } from '../shared/trade-verification-runtime.js';

async function reportReceipt(): Promise<void> {
  if (!/^\/trade\/[1-9][0-9]{0,19}\/receipt\/?$/.test(location.pathname)) return;
  const completed = Array.from(document.querySelectorAll('h1')).some((h) =>
    /^(обмен заверш[её]н|trade completed)$/i.test(h.textContent?.trim() ?? ''),
  );
  if (!completed) return;
  let context;
  try { context = readReceiptContext(sessionStorage.getItem(RECEIPT_CONTEXT_KEY), document.referrer, Date.now()); }
  catch { return; }
  if (!context) return;
  // Existing endpoint stores a client observation and triggers independent
  // server verification. It cannot authorize settlement from this DOM signal.
  const result = await chrome.runtime.sendMessage({
    type: TRADE_VERIFICATION_RUNTIME.REPORT_STEAM_OFFER_PAGE,
    orderId: context.orderId, offerId: context.offerId, lifecycle: 'accepted',
    idempotencyKey: `steam-page:${context.orderId}:${context.offerId}:accepted`,
  }) as { ok?: boolean };
  const panel = document.createElement('p');
  panel.textContent = result?.ok
    ? 'R.I.P Market: Steam завершил обмен. Площадка проверяет доставку; повторно принимать обмен не нужно. '
    : 'R.I.P Market: Steam завершил обмен. Откройте заказ для проверки статуса. ';
  const link = document.createElement('a');
  link.href = `https://p2pcs.ru/orders/${context.orderId}`;
  link.textContent = 'Открыть заказ';
  panel.append(link);
  (document.querySelector('#mainContent') ?? document.body).append(panel);
}
void reportReceipt().catch(() => undefined);
