import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consentOrderFromSender,
  isOrderConsentPage,
  prepareAndDispatch,
} from "./order-consent-flow";
import {
  CreateOfferOrchestrator,
  MockSteamOfferAdapter,
  InMemoryTaskProgressReporter,
  type PolledTradeTask,
} from "@rip-market/extension-orchestrator";
const id = "92406b1d-3bd3-41ae-ab02-68e87f628dc9";
afterEach(() => vi.unstubAllGlobals());
describe("trusted order consent orchestration", () => {
  it.each(["https://p2pcs.ru/", "https://www.p2pcs.ru/"])("accepts Chrome external sender root URL %s", (url) => {
    expect(consentOrderFromSender(id, url)).toBe(id);
  });
  it("accepts a production SPA route but rejects untrusted origins", () => {
    expect(consentOrderFromSender(id, `https://p2pcs.ru/orders/${id}`)).toBe(
      id,
    );
    for (const url of [
      `https://evil.test/orders/${id}`,
      `https://p2pcs.ru.evil.test/orders/${id}`,
      "http://p2pcs.ru/",
      "https://p2pcs.ru:444/",
      "https://www.p2pcs.ru.evil.test/",
      "not a URL",
    ])
      expect(consentOrderFromSender(id, url)).toBeNull();
    expect(
      consentOrderFromSender("../popup", "https://p2pcs.ru/orders/../popup"),
    ).toBeNull();
  });
  it.each(["../popup", "", "668efbd1-0d6f-4443-ae1e-238d835ab25z", "668efbd1-0d6f-4443-ae1e-238d835ab259/", null, undefined, 42])("rejects malformed orderId %j even from Chrome's production root sender", (orderId) => {
    expect(consentOrderFromSender(orderId, "https://p2pcs.ru/")).toBeNull();
  });
  it("binds confirmation to the extension-owned page and exact order", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        id: "extension",
        getURL: (p: string) => "chrome-extension://extension/" + p,
      },
    });
    expect(
      isOrderConsentPage(
        {
          id: "extension",
          url: `chrome-extension://extension/popup/order-consent.html?orderId=${id}`,
        },
        id,
      ),
    ).toBe(true);
    expect(
      isOrderConsentPage(
        {
          id: "extension",
          url: `https://p2pcs.ru/popup/order-consent.html?orderId=${id}`,
        },
        id,
      ),
    ).toBe(false);
    expect(
      isOrderConsentPage(
        {
          id: "other",
          url: `chrome-extension://extension/popup/order-consent.html?orderId=${id}`,
        },
        id,
      ),
    ).toBe(false);
    expect(
      isOrderConsentPage(
        {
          id: "extension",
          url: "chrome-extension://extension/popup/order-consent.html?orderId=other",
        },
        id,
      ),
    ).toBe(false);
  });
  it("polls immediately after the successful persisted preflight and awaits dispatch", async () => {
    const events: string[] = [];
    const prepare = vi.fn(async () => {
      events.push("baseline-persisted");
      return { baselineReady: true, reasonCode: "WAITING_FOR_OFFER" };
    });
    const poll = vi.fn(async () => {
      events.push("poll-dispatch");
    });
    await prepareAndDispatch(id, true, prepare, poll);
    expect(prepare).toHaveBeenCalledWith(id);
    expect(events).toEqual(["baseline-persisted", "poll-dispatch"]);
  });
  it("never prepares or dispatches without explicit consent", async () => {
    const prepare = vi.fn(),
      poll = vi.fn();
    await expect(prepareAndDispatch(id, false, prepare, poll)).rejects.toThrow(
      "CONSENT_REQUIRED",
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(poll).not.toHaveBeenCalled();
  });
  it.each([
    { baselineReady: false },
    { reasonCode: "WAITING_FOR_OFFER" },
    { baselineReady: true, reasonCode: "CHECK_SCHEDULED" },
  ])("does not poll for an unready preflight %j", async (result) => {
    const poll = vi.fn();
    await prepareAndDispatch(id, true, async () => result, poll);
    expect(poll).not.toHaveBeenCalled();
  });
  it("propagates preparation failure without dispatch", async () => {
    const poll = vi.fn();
    await expect(
      prepareAndDispatch(
        id,
        true,
        async () => {
          throw new Error("unavailable");
        },
        poll,
      ),
    ).rejects.toThrow("unavailable");
    expect(poll).not.toHaveBeenCalled();
  });
  it("runs the actual offer orchestrator after consent and ready baseline, opening the Steam adapter", async () => {
    const adapter = new MockSteamOfferAdapter("happy_path");
    const open = vi.spyOn(adapter, "warmTradePage");
    const reporter = new InMemoryTaskProgressReporter();
    const orchestrator = new CreateOfferOrchestrator(adapter, reporter);
    const task: PolledTradeTask = {
      id: "task",
      type: "create_offer",
      orderId: id,
      tradeOperationId: "operation",
      idempotencyKey: "task-key",
      executionPhase: null,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      attemptCount: 1,
      payload: {
        orderId: id,
        tradeOperationId: "operation",
        sellerId: "seller",
        buyerId: "buyer",
        expectedAssetId: "asset-123",
        expectedFloatValue: null,
        marketHashName: "AK-47 | Redline (Field-Tested)",
        buyerTradeUrl:
          "https://steamcommunity.com/tradeoffer/new/?partner=123&token=synthetic",
        inventoryAssetId: "asset",
        idempotencyKey: "task-key",
      },
    };
    await prepareAndDispatch(
      id,
      true,
      async () => ({ baselineReady: true, reasonCode: "WAITING_FOR_OFFER" }),
      () => orchestrator.processTask(task),
    );
    expect(open).toHaveBeenCalledOnce();
    expect(reporter.reports.map((x) => x.phase)).toEqual([
      "ACKED",
      "TRADE_PAGE_OPENED",
      "OFFER_DRAFTED",
      "ITEM_SELECTED",
      "OFFER_SUBMITTED",
      "OFFER_SENT",
    ]);
  });
});
