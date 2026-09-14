import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  DurableTaskProgressReporter,
  taskProgressScope,
} from "./durable-task-progress.js";
import type {
  ExtensionApiClient,
  TaskProgressReport,
} from "@rip-market/extension-orchestrator";
let storage: Record<string, unknown>;
beforeEach(() => {
  storage = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => ({ ...storage }),
        set: async (values: Record<string, unknown>) => {
          Object.assign(storage, values);
        },
        remove: async (key: string) => {
          delete storage[key];
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("isolates account queues while retaining them across session rotation", () => {
  const state = {
    apiBaseUrl: "https://example.com",
    deviceId: "same-device",
    sessionId: "session-1",
    accessToken: `x.${btoa(JSON.stringify({ sub: "alice" }))}.x`,
  };
  expect(taskProgressScope(state)).toBe(
    taskProgressScope({ ...state, sessionId: "session-2" }),
  );
  expect(taskProgressScope(state)).not.toBe(
    taskProgressScope({
      ...state,
      accessToken: `x.${btoa(JSON.stringify({ sub: "bob" }))}.x`,
    }),
  );
});
it("retains a failed send report across reporter restart and deletes only after acknowledgment", async () => {
  const reportTaskProgress = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ terminal: false });
  const client = { reportTaskProgress } as unknown as ExtensionApiClient;
  const event = {
    taskId: "task",
    phase: "OFFER_SENT",
    offerId: "123456789",
    idempotencyKey: "send",
  } as TaskProgressReport;
  await expect(
    new DurableTaskProgressReporter(client, "owner").report(event),
  ).rejects.toThrow("offline");
  expect(Object.keys(storage)).toHaveLength(1);
  await new DurableTaskProgressReporter(client, "owner").flush();
  expect(reportTaskProgress).toHaveBeenLastCalledWith(event);
  expect(Object.keys(storage)).toHaveLength(0);
});
it("quarantines a stale event without blocking the next task", async () => {
  const reportTaskProgress = vi
    .fn()
    .mockRejectedValueOnce({ status: 409 })
    .mockResolvedValue({ terminal: false });
  storage["rip:progress:owner:event:old"] = {
    progress: { taskId: "old-task", idempotencyKey: "old" },
    at: 1,
  };
  storage["rip:progress:owner:event:new"] = {
    progress: { taskId: "new-task", idempotencyKey: "new" },
    at: 2,
  };
  await new DurableTaskProgressReporter(
    { reportTaskProgress } as unknown as ExtensionApiClient,
    "owner",
  ).flush();
  expect(reportTaskProgress).toHaveBeenCalledTimes(2);
  expect(Object.keys(storage)).toEqual(["rip:progress:owner:rejected:old"]);
});

it("retains OFFER_SENT after a CAS conflict and still delivers another order", async () => {
  const send = {
    taskId: "a",
    phase: "OFFER_SENT",
    offerId: "123456789",
    idempotencyKey: "sent",
  };
  storage["rip:progress:owner:event:sent"] = { progress: send, at: 1 };
  storage["rip:progress:owner:event:other"] = {
    progress: { taskId: "b", phase: "ACKED", idempotencyKey: "other" },
    at: 2,
  };
  const reportTaskProgress = vi
    .fn()
    .mockRejectedValueOnce({ status: 409 })
    .mockResolvedValue({ terminal: false });
  const reporter = new DurableTaskProgressReporter(
    { reportTaskProgress } as unknown as ExtensionApiClient,
    "owner",
  );
  await reporter.flush();
  expect(reportTaskProgress).toHaveBeenCalledTimes(2);
  expect(storage["rip:progress:owner:event:sent"]).toBeDefined();
  expect(storage["rip:progress:owner:event:other"]).toBeUndefined();
  await reporter.flush();
  expect(storage["rip:progress:owner:event:sent"]).toBeUndefined();
});
it("does not overtake an offline event for the same task", async () => {
  storage["rip:progress:owner:event:1"] = {
    progress: { taskId: "a", phase: "ITEM_SELECTED" },
    at: 1,
  };
  storage["rip:progress:owner:event:2"] = {
    progress: { taskId: "a", phase: "OFFER_SUBMITTED" },
    at: 2,
  };
  const reportTaskProgress = vi.fn().mockRejectedValue(new Error("offline"));
  await new DurableTaskProgressReporter(
    { reportTaskProgress } as unknown as ExtensionApiClient,
    "owner",
  ).flush();
  expect(reportTaskProgress).toHaveBeenCalledTimes(1);
  expect(Object.keys(storage)).toHaveLength(2);
});
