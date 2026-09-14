import type {
  ExtensionApiClient,
  TaskProgressReport,
  TaskProgressReporter,
  PolledTradeTask,
} from "@rip-market/extension-orchestrator";
import { getCachedSentOffer } from "./trade-offer-sent-cache.js";

/** Namespace only; the server independently validates the token. Stable across refreshes. */
export function taskProgressScope(state: {
  apiBaseUrl: string;
  deviceId: string;
  sessionId: string;
  accessToken: string;
}): string {
  let owner = state.sessionId;
  try {
    const encoded = state.accessToken
      .split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded));
    if (typeof payload.sub === "string" && payload.sub) owner = payload.sub;
  } catch {
    /* An invalid token cannot share a previous session's queue. */
  }
  return `${state.apiBaseUrl}:${encodeURIComponent(owner)}:${state.deviceId}`;
}

function isPermanentRejection(error: unknown): boolean {
  return [400, 403, 404, 409].includes(
    (error as { status?: number })?.status ?? 0,
  );
}

/** Each event has its own key: concurrent writes cannot overwrite another event. */
export class DurableTaskProgressReporter implements TaskProgressReporter {
  private readonly prefix: string;
  constructor(
    private readonly client: ExtensionApiClient,
    scope: string,
  ) {
    this.prefix = `rip:progress:${scope}:`;
  }
  async remember(task: PolledTradeTask): Promise<void> {
    await chrome.storage.local.set({ [`${this.prefix}task:${task.id}`]: task });
  }
  async report(progress: TaskProgressReport): Promise<{ terminal: boolean }> {
    const key = `${this.prefix}event:${progress.idempotencyKey}`;
    await chrome.storage.local.set({ [key]: { progress, at: Date.now() } });
    const result = await this.client.reportTaskProgress(progress);
    await chrome.storage.local.remove(key);
    if (progress.phase === "OFFER_SENT") {
      await chrome.storage.local.remove(
        `${this.prefix}task:${progress.taskId}`,
      );
    }
    return { terminal: result.terminal };
  }
  async flush(): Promise<void> {
    const all = await chrome.storage.local.get(null);
    const events = Object.entries(all).filter(([key]) =>
      key.startsWith(`${this.prefix}event:`),
    ) as Array<[string, { progress: TaskProgressReport; at: number }]>;
    const blockedTasks = new Set<string>();
    for (const [key, entry] of events.sort((a, b) => a[1].at - b[1].at)) {
      if (blockedTasks.has(entry.progress.taskId)) continue;
      try {
        await this.client.reportTaskProgress(entry.progress);
      } catch (error) {
        if ((error as { status?: number })?.status === 401) throw error;
        // A 409 on OFFER_SENT may be a transient CAS race. Keep the evidence.
        if (
          !isPermanentRejection(error) ||
          (entry.progress.phase === "OFFER_SENT" &&
            (error as { status?: number })?.status === 409)
        ) {
          blockedTasks.add(entry.progress.taskId);
          continue;
        }
        await chrome.storage.local.set({
          [`${this.prefix}rejected:${entry.progress.idempotencyKey}`]: entry,
        });
      }
      await chrome.storage.local.remove(key);
    }
    // A worker can stop after recording the Steam result but before producing OFFER_SENT.
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(`${this.prefix}task:`)) continue;
      const task = value as PolledTradeTask;
      if (blockedTasks.has(task.id)) continue;
      const cached = await getCachedSentOffer(`draft-${task.id}`);
      if (!cached) continue;
      try {
        await this.report({
          taskId: task.id,
          leaseVersion: task.leaseVersion,
          phase: "OFFER_SENT",
          idempotencyKey: `progress:${task.id}:${task.attemptCount}:${task.leaseVersion ?? 0}:OFFER_SENT`,
          offerId: cached.offerId,
          details: {
            observedAssetId: cached.assetId ?? task.payload.expectedAssetId,
            observedFloatValue: cached.floatValue ?? null,
            confirmPending: cached.confirmPending,
          },
        });
      } catch (error) {
        if ((error as { status?: number })?.status === 401) throw error;
        if (
          !isPermanentRejection(error) ||
          (error as { status?: number })?.status === 409
        )
          continue;
        await chrome.storage.local.set({
          [`${this.prefix}rejected-task:${task.id}`]: {
            task,
            cached,
            at: Date.now(),
          },
        });
      }
      await chrome.storage.local.remove(key);
    }
  }
}
