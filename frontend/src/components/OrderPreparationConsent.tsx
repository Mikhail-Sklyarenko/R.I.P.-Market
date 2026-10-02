import { useState } from "react";
import { openOrderConsent } from "../utils/extension";
import type { Locale } from "../i18n/types";

export function OrderPreparationConsent({
  orderId,
  locale,
}: {
  orderId: string;
  locale: Locale;
}) {
  const [state, setState] = useState<"idle" | "opening" | "opened" | "error">(
    "idle",
  );
  const ru = locale === "ru";
  return (
    <section
      className="alert alert-info"
      aria-label={ru ? "Подготовка обмена" : "Trade preparation"}
    >
      <p>
        {ru
          ? "Чтобы отправить предмет, разрешите подготовку и проверку этого заказа в расширении. После подтверждения оно сохранит инвентари и автоматически откроет Steam."
          : "Authorize preparation and verification of this order in the extension. It will save both inventories and open Steam automatically after consent."}
      </p>
      <button
        type="button"
        disabled={state === "opening"}
        onClick={async () => {
          setState("opening");
          setState((await openOrderConsent(orderId)) ? "opened" : "error");
        }}
      >
        {ru ? "Подготовить безопасный обмен" : "Prepare safe trade"}
      </button>
      <p role="status">
        {state === "opening"
          ? ru
            ? "Открываем подтверждение в расширении…"
            : "Opening extension consent…"
          : state === "opened"
            ? ru
              ? "Подтвердите разрешение в открытой вкладке расширения. Ход подготовки и ошибки будут показаны там."
              : "Confirm in the extension tab. Preparation progress and errors will appear there."
            : state === "error"
              ? ru
                ? "Не удалось открыть расширение. Проверьте подключение и обновите его до версии с подготовкой обмена, затем повторите."
                : "Could not open the extension. Check its connection and update to the trade preparation release, then retry."
              : ""}
      </p>
    </section>
  );
}
