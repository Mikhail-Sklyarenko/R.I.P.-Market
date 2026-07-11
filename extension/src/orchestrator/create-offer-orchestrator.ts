import { floatsMatch } from '../float-match.util.js';
import type { SteamOfferAdapter } from '../adapters/steam-offer-adapter.js';
import type { TaskProgressReporter } from '../api/task-progress-reporter.js';
import { OfferErrorCode } from '../error-codes.js';
import { normalizeSteamOfferId } from '../steam-offer-id.util.js';
import type { PolledTradeTask, SteamInventoryItem } from '../types.js';

const TRADE_URL_PATTERN =
  /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[\w-]+/i;

const NON_RESUMABLE_PHASES = new Set([
  'OFFER_SENT',
  'OFFER_FAILED',
  'CONFIRM_PENDING',
]);

export class CreateOfferOrchestrator {
  constructor(
    private readonly steam: SteamOfferAdapter,
    private readonly reporter: TaskProgressReporter,
  ) {}

  async processTask(task: PolledTradeTask): Promise<void> {
    const baseKey = `progress:${task.id}`;

    if (task.executionPhase && NON_RESUMABLE_PHASES.has(task.executionPhase)) {
      return;
    }

    const resumeAtSend = task.executionPhase === 'OFFER_DRAFTED';
    const buyerTradeUrl = task.payload.buyerTradeUrl?.trim() ?? '';
    let matchedItem: SteamInventoryItem | null = null;
    let selectedObserved: {
      assetId: string;
      floatValue: string | null;
      marketHashName: string | null;
    } | null = null;

    if (!resumeAtSend) {
      if (task.executionPhase !== 'ACKED') {
        await this.reporter.report({
          taskId: task.id,
          phase: 'ACKED',
          idempotencyKey: `${baseKey}:ACKED`,
          details: {
            orderId: task.orderId,
            tradeOperationId: task.tradeOperationId,
          },
        });
      }

      if (!buyerTradeUrl) {
        await this.failTask(
          task.id,
          `${baseKey}:OFFER_FAILED:missing_url`,
          OfferErrorCode.BUYER_TRADE_URL_MISSING,
          'Buyer trade URL is missing',
        );
        return;
      }
      if (!TRADE_URL_PATTERN.test(buyerTradeUrl)) {
        await this.failTask(
          task.id,
          `${baseKey}:OFFER_FAILED:invalid_url`,
          OfferErrorCode.BUYER_TRADE_URL_INVALID,
          'Buyer trade URL is invalid',
        );
        return;
      }

      const sellerSteamId = task.payload.sellerSteamId
        ? String(task.payload.sellerSteamId)
        : null;

      const warmPagePromise = this.steam.warmTradePage(buyerTradeUrl);
      const sessionSteamId = await this.steam.resolveSessionSteamId();
      if (!sessionSteamId) {
        await warmPagePromise.catch(() => undefined);
        await this.failTask(
          task.id,
          `${baseKey}:OFFER_FAILED:inventory`,
          OfferErrorCode.INVENTORY_NOT_LOADED,
          'Seller is not logged into Steam in this browser',
          { sellerSteamId },
        );
        return;
      }
      if (sellerSteamId && sessionSteamId !== sellerSteamId) {
        await warmPagePromise.catch(() => undefined);
        await this.failTask(
          task.id,
          `${baseKey}:OFFER_FAILED:account_mismatch`,
          OfferErrorCode.STEAM_ACCOUNT_MISMATCH,
          'Logged-in Steam account does not match seller account',
          { sellerSteamId, sessionSteamId },
        );
        return;
      }

      const [, inventory] = await Promise.all([
        warmPagePromise,
        this.steam.loadSellerInventory(sellerSteamId),
      ]);
      if (!inventory || inventory.length === 0) {
        await this.failTask(
          task.id,
          `${baseKey}:OFFER_FAILED:inventory`,
          OfferErrorCode.INVENTORY_NOT_LOADED,
          'Seller inventory is not loaded',
          { sellerSteamId, sessionSteamId, inventoryCount: inventory?.length ?? 0 },
        );
        return;
      }

      const item = this.findMatchingItem(inventory, task);
      if (!item) {
        const expectedAssetId = task.payload.expectedAssetId
          ? String(task.payload.expectedAssetId)
          : null;
        const marketHashName = task.payload.marketHashName?.trim() ?? null;
        const nameMatches = marketHashName
          ? inventory.filter(
              (entry) =>
                entry.marketHashName?.trim().toLowerCase() ===
                marketHashName.toLowerCase(),
            )
          : [];
        const code =
          nameMatches.length > 1 && expectedAssetId
            ? OfferErrorCode.ITEM_MISMATCH
            : OfferErrorCode.ITEM_MISSING;
        await this.failTask(
          task.id,
          `${baseKey}:OFFER_FAILED:item`,
          code,
          'Expected item not found in seller inventory',
          { inventoryCount: inventory.length, expectedAssetId, marketHashName },
        );
        return;
      }

      matchedItem = item;

      const draft = await this.steam.draftOffer({
        buyerTradeUrl,
        item,
        taskId: task.id,
      });
      if (!draft.ok) {
        await this.failTask(
          task.id,
          `${baseKey}:OFFER_FAILED:draft`,
          draft.code,
          draft.message,
        );
        return;
      }

      await this.reporter.report({
        taskId: task.id,
        phase: 'TRADE_PAGE_OPENED',
        idempotencyKey: `${baseKey}:TRADE_PAGE_OPENED`,
        details: { buyerTradeUrl },
      });

      await this.reporter.report({
        taskId: task.id,
        phase: 'OFFER_DRAFTED',
        idempotencyKey: `${baseKey}:OFFER_DRAFTED`,
        details: {
          draftId: draft.draftId,
          assetId: item.assetId,
          marketHashName: item.marketHashName ?? task.payload.marketHashName,
        },
      });
    }

    const draftId = `draft-${task.id}`;
    if (resumeAtSend && !matchedItem && task.payload.expectedAssetId) {
      matchedItem = {
        assetId: String(task.payload.expectedAssetId),
        floatValue: task.payload.expectedFloatValue ?? null,
        marketHashName: task.payload.marketHashName ?? null,
      };
    }

    const sent = await this.steam.sendOffer(draftId, {
      onItemSelected: async (details) => {
        selectedObserved = {
          assetId: details.assetId,
          floatValue: details.floatValue ?? null,
          marketHashName: details.marketHashName ?? null,
        };
        await this.reporter.report({
          taskId: task.id,
          phase: 'ITEM_SELECTED',
          idempotencyKey: `${baseKey}:ITEM_SELECTED`,
          details: {
            assetId: details.assetId,
            marketHashName: details.marketHashName ?? null,
            observedAssetId: details.assetId,
            observedFloatValue: details.floatValue ?? null,
          },
        });
      },
      onOfferSubmitted: async () => {
        await this.reporter.report({
          taskId: task.id,
          phase: 'OFFER_SUBMITTED',
          idempotencyKey: `${baseKey}:OFFER_SUBMITTED`,
        });
      },
    });
    if (!sent.ok) {
      await this.failTask(
        task.id,
        `${baseKey}:OFFER_FAILED:send`,
        sent.code,
        sent.message,
      );
      return;
    }

    const offerId = normalizeSteamOfferId(sent.offerId);
    const observedAssetId =
      selectedObserved?.assetId ?? matchedItem?.assetId ?? null;
    const observedFloatValue =
      selectedObserved?.floatValue ?? matchedItem?.floatValue ?? null;
    const observedDetails = {
      orderId: task.orderId,
      tradeOperationId: task.tradeOperationId,
      ...(observedAssetId ? { observedAssetId } : {}),
      ...(observedFloatValue ? { observedFloatValue } : {}),
    };

    if (sent.confirmPending) {
      await this.reporter.report({
        taskId: task.id,
        phase: 'CONFIRM_PENDING',
        idempotencyKey: `${baseKey}:CONFIRM_PENDING`,
        reasonCode: OfferErrorCode.CONFIRM_PENDING,
        offerId: offerId ?? undefined,
        details: {
          message: 'Confirm trade offer in Steam Mobile',
          ...(offerId ? { offerId } : {}),
        },
      });

      if (offerId) {
        await this.reporter.report({
          taskId: task.id,
          phase: 'OFFER_SENT',
          idempotencyKey: `${baseKey}:OFFER_SENT`,
          offerId,
          details: {
            ...observedDetails,
            confirmPending: true,
          },
        });
      }
      return;
    }

    if (!offerId) {
      await this.failTask(
        task.id,
        `${baseKey}:OFFER_FAILED:invalid_offer_id`,
        OfferErrorCode.OFFER_SEND_FAILED,
        'Steam returned invalid trade offer id',
        { rawOfferId: sent.offerId ?? null },
      );
      return;
    }

    await this.reporter.report({
      taskId: task.id,
      phase: 'OFFER_SENT',
      idempotencyKey: `${baseKey}:OFFER_SENT`,
      offerId,
      details: observedDetails,
    });
  }

  private findMatchingItem(
    inventory: SteamInventoryItem[],
    task: PolledTradeTask,
  ): SteamInventoryItem | null {
    const expectedAssetId = task.payload.expectedAssetId
      ? String(task.payload.expectedAssetId)
      : null;
    const marketHashName = task.payload.marketHashName?.trim() ?? null;
    const expectedFloatValue = task.payload.expectedFloatValue ?? null;

    if (expectedAssetId) {
      const byAsset = inventory.find(
        (entry) => String(entry.assetId) === expectedAssetId,
      );
      if (byAsset) {
        return floatsMatch(expectedFloatValue, byAsset.floatValue)
          ? byAsset
          : null;
      }
    }

    if (marketHashName) {
      const normalizedTarget = marketHashName.toLowerCase();
      const byName = inventory.filter(
        (entry) =>
          entry.marketHashName?.trim().toLowerCase() === normalizedTarget,
      );
      if (expectedFloatValue) {
        const byFloat = byName.filter((entry) =>
          floatsMatch(expectedFloatValue, entry.floatValue),
        );
        if (byFloat.length === 1) {
          return byFloat[0] ?? null;
        }
        if (byFloat.length > 1 && expectedAssetId) {
          return null;
        }
        if (byFloat.length === 0) {
          return null;
        }
      }
      if (byName.length === 1) {
        return byName[0] ?? null;
      }
      if (byName.length > 1 && expectedAssetId) {
        return null;
      }
      if (byName.length > 0) {
        return byName[0] ?? null;
      }
    }

    return null;
  }

  private async failTask(
    taskId: string,
    idempotencyKey: string,
    reasonCode: string,
    message: string,
    extraDetails?: Record<string, unknown>,
  ): Promise<void> {
    await this.reporter.report({
      taskId,
      phase: 'OFFER_FAILED',
      idempotencyKey,
      reasonCode,
      details: { message, ...extraDetails },
    });
  }
}
