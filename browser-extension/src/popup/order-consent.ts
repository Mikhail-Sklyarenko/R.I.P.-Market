export {};
const orderId = new URL(location.href).searchParams.get("orderId") ?? "";
const allow = document.getElementById("allow") as HTMLButtonElement;
const status = document.getElementById("status")!;
const valid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(orderId);
document.getElementById("order")!.textContent = `Заказ: ${orderId}`;
if (valid)
  (document.getElementById("back") as HTMLAnchorElement).href =
    `https://p2pcs.ru/orders/${orderId}`;
allow.disabled = !valid;
const reasons: Record<string, string> = {
  BUYER_STEAM_ID_MISSING:
    "Покупатель не привязал Steam. Обмен не отправлен; покупателю нужно проверить профиль на сайте.",
  MANUAL_REVIEW:
    "Этот заказ требует проверки поддержки. Автоматическая отправка остановлена.",
  BASELINE_EXPIRED:
    "Снимок инвентарей устарел. Нужна проверка поддержки; новый обмен не создаётся.",
  BASELINE_UNAVAILABLE:
    "Steam не предоставил полный инвентарь одного из участников. Обмен не отправлен. Повторите через несколько минут.",
  BASELINE_RETRY_SCHEDULED:
    "Повторная подготовка пока отложена после ошибки Steam. Повторите через несколько минут.",
  BEFORE_BASELINE_NOT_READY:
    "Не удалось подготовить полный снимок инвентарей. Обмен не отправлен. Проверьте доступность инвентарей Steam и повторите подготовку.",
  MAPPING_WINDOW_BUSY:
    "Участник занят другой проверкой обмена. Дождитесь её завершения.",
  BASELINE_ORIGINAL_MISSING:
    "Предмет отсутствует в доступном инвентаре продавца. Обмен не отправлен.",
  STEAM_RATE_LIMITED: "Steam ограничивает запросы. Повторите подготовку позже.",
  WRONG_STEAM_ACCOUNT: "В Steam открыт другой аккаунт. Войдите как продавец.",
};
allow.addEventListener("click", async () => {
  allow.disabled = true;
  status.textContent =
    "Подготовка безопасного обмена: получаем инвентари обоих участников…";
  const timer = setTimeout(() => {
    status.textContent =
      "Steam задерживает подготовку. Обмен пока не отправлен. Проверка может ещё завершиться; актуальный статус доступен в заказе.";
  }, 125000);
  try {
    const reply = await chrome.runtime.sendMessage({
      type: "RIP_MARKET_STEAM_ORDER_VERIFY",
      orderId,
      consent: true,
    });
    status.textContent =
      reply?.ok && reply.result?.baselineReady === true
        ? "Инвентари сохранены. Задача отправки запрошена; следите за открытием Steam и статусом заказа."
        : (reasons[reply?.result?.reasonCode] ??
          reasons[reply?.error] ??
          "Подготовка не завершена. Проверьте подключение расширения и аккаунт продавца, затем повторите.");
  } catch {
    status.textContent =
      "Связь с расширением прервалась. Проверьте статус заказа перед повторной попыткой.";
  } finally {
    clearTimeout(timer);
    allow.disabled = false;
  }
});
document.getElementById("stop")!.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({
    type: "RIP_MARKET_STEAM_ORDER_STOP",
    orderId,
  });
  status.textContent =
    "Будущая передача остановлена. Уже отправленный запрос может завершиться.";
});
