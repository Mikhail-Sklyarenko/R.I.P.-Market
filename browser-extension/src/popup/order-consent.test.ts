import { beforeEach, afterEach, it, expect, vi } from "vitest";
const id = "92406b1d-3bd3-41ae-ab02-68e87f628dc9";
let send: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML =
    '<p id="order"></p><button id="allow"></button><button id="stop"></button><p id="status"></p><a id="back"></a>';
  vi.stubGlobal(
    "location",
    new URL(
      `chrome-extension://extension/popup/order-consent.html?orderId=${id}`,
    ),
  );
  send = vi.fn();
  vi.stubGlobal("chrome", { runtime: { sendMessage: send } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("does nothing on open; one explicit click starts preparation for the bound order", async () => {
  send.mockResolvedValue({
    ok: true,
    result: { baselineReady: true, reasonCode: "WAITING_FOR_OFFER" },
  });
  await import("./order-consent");
  expect(send).not.toHaveBeenCalled();
  document.getElementById("allow")!.click();
  expect(document.getElementById("status")!.textContent).toContain(
    "Подготовка безопасного обмена",
  );
  await vi.waitFor(() =>
    expect(document.getElementById("status")!.textContent).toContain(
      "Инвентари сохранены",
    ),
  );
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: "RIP_MARKET_STEAM_ORDER_VERIFY",
    orderId: id,
    consent: true,
  });
});
it("shows the actual failure and enables retry without claiming Steam opened", async () => {
  send.mockResolvedValue({
    ok: true,
    result: { baselineReady: false, reasonCode: "MAPPING_WINDOW_BUSY" },
  });
  await import("./order-consent");
  document.getElementById("allow")!.click();
  await vi.waitFor(() =>
    expect(document.getElementById("status")!.textContent).toContain(
      "занят другой проверкой",
    ),
  );
  expect((document.getElementById("allow") as HTMLButtonElement).disabled).toBe(
    false,
  );
});
it("shows bounded timeout feedback instead of endless preparation", async () => {
  vi.useFakeTimers();
  send.mockReturnValue(new Promise(() => {}));
  await import("./order-consent");
  document.getElementById("allow")!.click();
  await vi.advanceTimersByTimeAsync(125000);
  expect(document.getElementById("status")!.textContent).toContain(
    "Steam задерживает подготовку",
  );
});
