/**
 * D1–D9: CS2 inventory content script.
 * Host bar, enrichment, sell/manage/bulk, pre-list safety, seller onboarding.
 * Never rewrites Steam item markup; only appends overlay nodes.
 */
import {
  fetchCs2InventoryEnrichmentFacts,
} from '../shared/inventory-enrichment-data.js';
import {
  applyPlatformNamesToSteamFacts,
  buildDomBaselineSteamFacts,
  mergeSteamFactsMaps,
} from '../shared/inventory-dom-facts.js';
import {
  inventoryItemSteamFactsToMap,
  type PageEnrichmentLoadResult,
} from '../shared/steam-inventory-page-enrichment.js';
import { TRADE_VERIFICATION_RUNTIME } from '../shared/trade-verification-runtime.js';
import {
  buildInventoryItemEnrichmentView,
  CS2_INVENTORY_ITEM_SELECTOR,
  parseAssetIdFromItemElementId,
  queryCs2InventoryItemByAssetId,
  readSteamIdFromDocumentHtml,
  resolveInventoryPageSteamId,
  type InventoryItemPlatformFacts,
  type InventoryItemSteamFacts,
} from '../shared/inventory-item-enrichment.js';
import type { InventoryPriceHintLike } from '../shared/inventory-price-intel.js';
import {
  buildManagePricePreview,
  formatListedPriceInput,
  formatManageCurrentPriceLine,
  hasPriceChanged,
  resolveManageListingAction,
} from '../shared/inventory-manage-listing.js';
import {
  buildBulkProgress,
  buildBulkSellItem,
  canSelectForBulkSell,
  formatBulkListingPreview,
  planBulkSellOperations,
  toggleBulkSelection,
  validateBulkSelectionForSubmit,
  type BulkSellItem,
} from '../shared/inventory-bulk-sell.js';
import {
  buildInventorySellPreview,
  formatUsdInputFromMinor,
  parseUsdInputToMinor,
  resolveBidListOffer,
  resolveDefaultListPriceMinor,
  resolveInventorySellAction,
  validateCreateLotPriceMinor,
  type InventorySellAction,
} from '../shared/inventory-one-click-sell.js';
import {
  humanizeListingApiError,
  isHardSteamTradeBanCode,
} from '../shared/listing-api-errors.js';
import { resolveInventoryLayerView } from '../shared/inventory-layer.js';
import { getStoredSiteLinkSnapshot } from '../shared/offline-safe-mode.js';
import {
  defaultTwoMinuteOnboardingState,
  getTwoMinuteOnboardingState,
  persistDismissTrialListHint,
  recordTwoMinuteFirstList,
  recordTwoMinuteInventoryVisit,
  resolveTrialListHintView,
} from '../shared/two-minute-onboarding.js';
import {
  COACH_AUTO_DISMISS_MS,
  dismissCoachMark,
  INVENTORY_SELLER_ONBOARDING_KEY,
  markCoachSeen,
  parseOnboardingState,
  resolveCoachMarkView,
  resolveSellerChecklistView,
  type InventorySellerOnboardingState,
} from '../shared/inventory-seller-onboarding.js';
import {
  createExtensionT,
  getStoredExtensionLocale,
} from '../shared/extension-i18n.js';
import { isExtensionContextValid } from '../shared/extension-context.js';
import {
  SELECTED_SELL_RAIL_ID,
  buildSelectedSellRailModel,
  findVisibleItemActionsRoot,
  readSelectedCs2ItemFromDom,
} from '../shared/inventory-selected-actions.js';
import { getSessionState } from '../shared/storage.js';
import {
  LAZY_ENRICH_BATCH_SIZE,
  LAZY_ENRICH_VIEWPORT_MARGIN_PX,
  partitionHoldersForEnrich,
} from '../shared/inventory-lazy-enrich.js';
import {
  canProceedPastRateLimit,
  noteRateLimitHit,
} from '../shared/rate-limit-backoff-runtime.js';
import { isExtensionInventoryLayerEnabled } from '../shared/extension-flags.js';
import {
  countVisibleCs2InventoryItemHolders,
  isCs2InventoryActive,
  isSteamInventoryPath,
  listPaintableCs2InventoryCells,
  siteAccountUrl,
  siteListingsPageUrl,
  siteSellInventoryUrl,
} from '../shared/steam-inventory-page.js';
import {
  dismissTradeHoldBanner,
  isTradeHoldBannerDismissed,
  readSteamItemIconUrl,
  resolveTradeHoldBannerView,
} from '../shared/inventory-trade-hold.js';
import { resolveSellPanelPriceRails } from '../shared/inventory-sell-panel-rails.js';
import {
  clearInventorySellDraft,
  readInventorySellDraft,
  resolveInventorySellDraftRestore,
  writeInventorySellDraft,
  type InventorySellDraft,
} from '../shared/inventory-sell-draft.js';
import { buildBrowserAssistAssetsFromFacts } from '../shared/inventory-browser-assist.js';

const HOST_ID = 'rip-market-inventory-layer';
const STYLE_ID = 'rip-market-inventory-layer-style';
const ATTR_READY = 'data-rip-inventory-ready';
const ENRICH_ATTR = 'data-rip-enriched';
const OVERLAY_CLASS = 'rip-item-enrich';
const SELL_PANEL_ID = 'rip-market-sell-panel';
const TOAST_ID = 'rip-market-sell-toast';
const BULK_BAR_ID = 'rip-market-bulk-bar';

const STEAM_FACTS_TTL_MS = 90_000;
const STEAM_ENRICHMENT_RECOVERY_MS = 8_000;
const PLATFORM_FACTS_TTL_MS = 60_000;
const PRICE_HINTS_TTL_MS = 120_000;

type CachedSteamFacts = {
  fetchedAt: number;
  byAssetId: Map<string, InventoryItemSteamFacts>;
};

type CachedPlatformFacts = {
  fetchedAt: number;
  byAssetId: Record<string, InventoryItemPlatformFacts>;
};

type CachedPriceHints = {
  fetchedAt: number;
  byName: Record<string, InventoryPriceHintLike>;
};

let steamFactsCache: CachedSteamFacts | null = null;
let platformFactsCache: CachedPlatformFacts | null = null;
let priceHintsCache: CachedPriceHints | null = null;
let steamFactsInflight: Promise<Map<string, InventoryItemSteamFacts>> | null =
  null;
let enrichTimer: number | null = null;
let renderTimer: number | null = null;
let mounted = false;
let bulkMode = false;
let bulkSelected = new Set<string>();
let lastConnected = false;
let lastSiteSafeMode = false;
let coachAutoDismissTimer: number | null = null;
let coachMarkedSeenThisSession = false;
let enrichObserver: IntersectionObserver | null = null;
let deferredEnrichContext: {
  steamFacts: Map<string, InventoryItemSteamFacts>;
  platformFacts: Record<string, InventoryItemPlatformFacts>;
  priceHints: Record<string, InventoryPriceHintLike>;
  connected: boolean;
} | null = null;
let deferredEnrichQueue: Element[] = [];
let deferredEnrichRaf: number | null = null;
/** Soft UX when Steam inventory JSON fails after retries. */
let steamEnrichmentDegraded = false;
let steamEnrichmentRetryTimer: number | null = null;
/** True after chrome.* calls fail with Extension context invalidated. */
let extensionContextInvalidated = false;
/** Last CS2 asset the user clicked in the grid (selected-rail fallback). */
let lastClickedAssetId: string | null = null;
/** T6: one restore pass per tab mount. */
let sellDraftRestoreAttempted = false;
/** Host chip after F5 restore. */
let sellDraftRestoreChip: string | null = null;
/** Price draft restored for a specific asset (applied on next openSellPanel). */
let sellDraftPriceByAsset: { assetId: string; priceInput: string } | null =
  null;
let browserAssistBusy = false;

function currentPageSteamId(): string | null {
  return readSteamIdFromDocumentHtml(document.documentElement?.innerHTML ?? '');
}

function persistSellDraft(): void {
  const draft: InventorySellDraft = {
    version: 1,
    steamId: currentPageSteamId(),
    bulkMode,
    selectedAssetIds: [...bulkSelected],
    priceInput: sellDraftPriceByAsset?.priceInput ?? null,
    priceAssetId: sellDraftPriceByAsset?.assetId ?? null,
    updatedAt: Date.now(),
  };
  if (
    !draft.bulkMode &&
    draft.selectedAssetIds.length === 0 &&
    !draft.priceInput
  ) {
    clearInventorySellDraft();
    sellDraftRestoreChip = null;
    return;
  }
  writeInventorySellDraft(draft);
}

async function runBrowserAssistSync(): Promise<void> {
  if (browserAssistBusy || !isExtensionContextValid()) {
    return;
  }
  const steamId = currentPageSteamId();
  const facts = steamFactsCache?.byAssetId;
  if (!steamId || !facts || facts.size === 0) {
    showSellToast({
      message: 'Сначала дождитесь загрузки предметов на странице Steam',
    });
    return;
  }
  const iconByAssetId = new Map<string, string | null>();
  for (const assetId of facts.keys()) {
    iconByAssetId.set(
      assetId,
      readSteamItemIconUrl(document, assetId, queryCs2InventoryItemByAssetId),
    );
  }
  const assets = buildBrowserAssistAssetsFromFacts(facts.values(), iconByAssetId);
  if (assets.length === 0) {
    showSellToast({ message: 'Нет предметов с названием для синхронизации' });
    return;
  }

  browserAssistBusy = true;
  scheduleHostRender();
  try {
    const response = (await chrome.runtime.sendMessage({
      type: TRADE_VERIFICATION_RUNTIME.BROWSER_ASSIST_INVENTORY_SYNC,
      steamId,
      assets,
      complete: true,
    })) as {
      ok?: boolean;
      itemCount?: number;
      warning?: string | null;
      error?: string;
    };
    if (!response?.ok) {
      showSellToast({
        message: response?.error ?? 'Не удалось обновить инвентарь на сайте',
      });
      return;
    }
    platformFactsCache = null;
    showSellToast({
      message:
        response.warning ||
        `Сайт обновлён: ${response.itemCount ?? assets.length} предметов`,
    });
    scheduleEnrichment(false);
  } catch (error: unknown) {
    showSellToast({
      message:
        error instanceof Error
          ? error.message
          : 'Не удалось обновить инвентарь на сайте',
    });
  } finally {
    browserAssistBusy = false;
    scheduleHostRender();
  }
}

function tryRestoreSellDraft(
  knownAssetIds: ReadonlySet<string>,
): void {
  if (sellDraftRestoreAttempted) {
    return;
  }
  sellDraftRestoreAttempted = true;
  const view = resolveInventorySellDraftRestore({
    draft: readInventorySellDraft(),
    pageSteamId: currentPageSteamId(),
    knownAssetIds,
  });
  if (!view.restored) {
    return;
  }
  if (view.bulkMode || view.selectedAssetIds.length > 0) {
    bulkMode = view.bulkMode || view.selectedAssetIds.length > 0;
    bulkSelected = new Set(view.selectedAssetIds);
  }
  if (view.priceAssetId && view.priceInput) {
    sellDraftPriceByAsset = {
      assetId: view.priceAssetId,
      priceInput: view.priceInput,
    };
  }
  sellDraftRestoreChip = view.chipLabel;
  persistSellDraft();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${HOST_ID} {
      display: block;
      margin: 10px 0 14px;
      padding: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      z-index: 20;
      position: relative;
      --rip-bg: rgba(24, 28, 38, 0.96);
      --rip-bg-deep: #0b0d12;
      --rip-border: rgba(255, 255, 255, 0.1);
      --rip-text: #f4f4f5;
      --rip-muted: #94a3b8;
      --rip-link: #7dd3fc;
      --rip-primary-from: #0284c7;
      --rip-primary-to: #2563eb;
      --rip-success: #86efac;
      --rip-success-bg: rgba(34, 197, 94, 0.16);
      --rip-warn: #fde047;
      --rip-warn-bg: rgba(234, 179, 8, 0.14);
      --rip-danger: #fecaca;
      --rip-danger-bg: rgba(239, 68, 68, 0.14);
    }
    #${HOST_ID} .rip-inv-bar {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px 16px;
      border-radius: 14px;
      background:
        linear-gradient(145deg, rgba(2, 132, 199, 0.08), transparent 42%),
        var(--rip-bg);
      border: 1px solid var(--rip-border);
      color: var(--rip-text);
      font-size: 13px;
      line-height: 1.4;
      box-shadow:
        0 10px 28px rgba(0, 0, 0, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    #${HOST_ID} .rip-inv-bar[data-connection="disconnected"] {
      border-color: rgba(234, 179, 8, 0.35);
      background:
        linear-gradient(145deg, rgba(234, 179, 8, 0.1), transparent 50%),
        var(--rip-bg);
    }
    #${HOST_ID} .rip-inv-bar[data-connection="safe_mode"] {
      border-color: rgba(234, 179, 8, 0.4);
      background:
        linear-gradient(145deg, rgba(234, 179, 8, 0.12), transparent 50%),
        var(--rip-bg);
    }
    #${HOST_ID} .rip-inv-bar-top {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      align-items: center;
      justify-content: space-between;
    }
    #${HOST_ID} .rip-inv-identity {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }
    #${HOST_ID} .rip-inv-brand {
      color: var(--rip-link);
      font-weight: 750;
      font-size: 14px;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }
    #${HOST_ID} .rip-inv-status {
      display: inline-flex;
      align-items: center;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 650;
      line-height: 1.2;
      border: 1px solid transparent;
    }
    #${HOST_ID} .rip-inv-status[data-connection="connected"] {
      color: var(--rip-success);
      background: var(--rip-success-bg);
      border-color: rgba(134, 239, 172, 0.28);
    }
    #${HOST_ID} .rip-inv-status[data-connection="disconnected"],
    #${HOST_ID} .rip-inv-status[data-connection="safe_mode"] {
      color: var(--rip-warn);
      background: var(--rip-warn-bg);
      border-color: rgba(253, 224, 71, 0.28);
    }
    #${HOST_ID} .rip-inv-meta {
      color: var(--rip-muted);
      font-size: 12px;
      white-space: nowrap;
    }
    #${HOST_ID} .rip-inv-body {
      margin: 0;
      color: var(--rip-muted);
      font-size: 12.5px;
      max-width: 62ch;
    }
    #${HOST_ID} .rip-inv-bar-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    #${HOST_ID} .rip-inv-cta,
    #${HOST_ID} .rip-inv-cta-secondary,
    #${HOST_ID} .rip-inv-bulk-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border-radius: 9px;
      font-weight: 650;
      font-size: 12px;
      line-height: 1.2;
      white-space: nowrap;
      cursor: pointer;
      text-decoration: none !important;
      transition: filter 0.12s ease, border-color 0.12s ease, background 0.12s ease;
    }
    #${HOST_ID} .rip-inv-cta {
      border: none;
      background: linear-gradient(135deg, var(--rip-primary-from), var(--rip-primary-to));
      color: #fff !important;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--rip-primary-from) 35%, transparent);
    }
    #${HOST_ID} .rip-inv-cta:hover { filter: brightness(1.07); }
    #${HOST_ID} .rip-inv-cta-secondary,
    #${HOST_ID} button.rip-inv-cta-secondary {
      border: 1px solid var(--rip-border);
      background: rgba(15, 23, 42, 0.65);
      color: #e2e8f0;
    }
    #${HOST_ID} .rip-inv-cta-secondary:hover {
      border-color: rgba(125, 211, 252, 0.35);
      color: #fff;
    }
    #${HOST_ID} .rip-inv-bulk-toggle {
      border: 1px solid rgba(125, 211, 252, 0.28);
      background: rgba(14, 165, 233, 0.1);
      color: var(--rip-link);
    }
    #${HOST_ID} .rip-inv-bulk-toggle[data-active="1"] {
      border-color: transparent;
      background: linear-gradient(135deg, var(--rip-primary-from), var(--rip-primary-to));
      color: #fff;
    }
    #${HOST_ID} .rip-inv-draft-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(125, 211, 252, 0.28);
      color: var(--rip-link);
      font-size: 11px;
      font-weight: 600;
    }
    #${HOST_ID} .rip-inv-draft-chip button {
      border: 0;
      background: transparent;
      color: var(--rip-muted);
      cursor: pointer;
      font-size: 11px;
      padding: 0;
    }

    #${HOST_ID} .rip-inv-hold {
      margin-top: 8px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(253, 224, 71, 0.32);
      background: var(--rip-warn-bg);
      color: #fef3c7;
      font-size: 12px;
      line-height: 1.4;
    }
    #${HOST_ID} .rip-inv-hold-title {
      margin: 0 0 4px;
      font-weight: 700;
      color: #fde047;
    }
    #${HOST_ID} .rip-inv-hold-body {
      margin: 0 0 8px;
      color: #f5e6b8;
    }
    #${HOST_ID} .rip-inv-hold-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    #${HOST_ID} .rip-inv-steam-warn {
      margin: 0;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--rip-warn-bg);
      border: 1px solid rgba(253, 224, 71, 0.28);
      color: #f5e6b8;
      font-size: 12px;
      line-height: 1.35;
    }
    #${HOST_ID} .rip-inv-reload {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--rip-danger-bg);
      border: 1px solid rgba(248, 113, 113, 0.35);
      color: var(--rip-danger);
      font-size: 12px;
      line-height: 1.4;
      font-weight: 600;
    }
    #${HOST_ID} .rip-inv-reload button {
      margin-left: 8px;
      padding: 5px 10px;
      border-radius: 8px;
      border: 1px solid rgba(248, 113, 113, 0.45);
      background: rgba(127, 29, 29, 0.55);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }

    .itemHolder {
      position: relative !important;
      --rip-primary-from: #0284c7;
      --rip-primary-to: #2563eb;
      --rip-link: #7dd3fc;
      --rip-success: #86efac;
      --rip-warn: #fde047;
      --rip-danger: #fecaca;
      --rip-muted: #94a3b8;
      --rip-text: #f4f4f5;
    }
    /* Mount on Steam's .item — it fills the holder and otherwise covers sibling overlays. */
    .itemHolder .item[id^="item730_"],
    .itemHolder .item[id^="730_"] {
      position: absolute !important;
    }
    .itemHolder .item[id^="item730_"] .${OVERLAY_CLASS},
    .itemHolder .item[id^="730_"] .${OVERLAY_CLASS},
    .itemHolder .${OVERLAY_CLASS} {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      top: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      pointer-events: none;
      z-index: 1000 !important;
      font-family: Inter, "Segoe UI", system-ui, sans-serif;
      border-radius: 2px;
      overflow: hidden;
    }
    .itemHolder:hover .${OVERLAY_CLASS},
    .itemHolder .item.activeInfo .${OVERLAY_CLASS} {
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rip-link) 55%, transparent);
    }
    .itemHolder .rip-item-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      padding: 3px;
      min-height: 0;
      pointer-events: auto;
    }
    .itemHolder .rip-item-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 600;
      line-height: 1.25;
      border: 1px solid transparent;
      text-decoration: none !important;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-shadow: 0 1px 1px rgba(0,0,0,0.55);
    }
    .itemHolder .rip-item-badge--accent {
      background: color-mix(in srgb, var(--rip-primary-to) 88%, transparent);
      color: #fff;
      border-color: color-mix(in srgb, var(--rip-link) 45%, transparent);
    }
    .itemHolder .rip-item-badge--ok {
      background: rgba(34, 197, 94, 0.88);
      color: #ecfdf5;
      border-color: rgba(134, 239, 172, 0.45);
    }
    .itemHolder .rip-item-badge--warn {
      background: rgba(234, 179, 8, 0.88);
      color: #1c1917;
      border-color: rgba(253, 224, 71, 0.45);
    }
    .itemHolder .rip-item-badge--info {
      background: rgba(2, 132, 199, 0.88);
      color: #e0f2fe;
      border-color: rgba(125, 211, 252, 0.4);
    }
    .itemHolder .rip-item-badge--muted {
      background: rgba(30, 41, 59, 0.92);
      color: var(--rip-muted);
      border-color: rgba(255, 255, 255, 0.1);
    }
    .itemHolder .rip-item-footer {
      display: grid;
      gap: 3px;
      padding: 5px 4px 4px;
      background: linear-gradient(
        180deg,
        rgba(11, 13, 18, 0) 0%,
        rgba(11, 13, 18, 0.72) 22%,
        rgba(11, 13, 18, 0.94) 100%
      );
    }
    .itemHolder .rip-item-wear-track {
      position: relative;
      height: 2px;
      border-radius: 999px;
      background: linear-gradient(90deg, #6ecf6e 0%, #7fd67f 7%, #5fd0d5 15%, #ffb454 38%, #ff6b57 45%, #ff6b57 100%);
      overflow: hidden;
      opacity: 0.9;
    }
    .itemHolder .rip-item-wear-pointer {
      position: absolute;
      top: -1px;
      width: 2px;
      height: 4px;
      background: #fff;
      box-shadow: 0 0 2px #000;
      transform: translateX(-50%);
    }
    .itemHolder .rip-item-meta {
      color: var(--rip-muted);
      font-size: 9px;
      font-weight: 500;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }
    .itemHolder .rip-item-price {
      color: var(--rip-text);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 1px 2px rgba(0,0,0,0.75);
    }
    .itemHolder .rip-item-detail {
      display: none;
      gap: 1px;
    }
    .itemHolder:hover .rip-item-detail,
    .itemHolder .item.activeInfo .rip-item-detail,
    .itemHolder[data-rip-bulk-selected="1"] .rip-item-detail {
      display: grid;
    }
    .itemHolder .rip-item-price-sub {
      color: var(--rip-muted);
      font-size: 8px;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .itemHolder .rip-item-price-net {
      color: var(--rip-success);
      font-size: 8px;
      font-weight: 600;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .itemHolder .rip-item-price-bid {
      color: var(--rip-warn);
      font-size: 8px;
      font-weight: 600;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .itemHolder .rip-item-sell {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
      padding: 5px 6px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: linear-gradient(135deg, var(--rip-primary-from), var(--rip-primary-to));
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.01em;
      line-height: 1.15;
      cursor: pointer;
      pointer-events: auto;
      width: 100%;
      box-sizing: border-box;
      box-shadow:
        0 0 0 1px color-mix(in srgb, var(--rip-primary-from) 35%, transparent),
        0 1px 2px rgba(0,0,0,0.35);
    }
    .itemHolder .rip-item-sell:hover {
      filter: brightness(1.06);
    }
    .itemHolder .rip-item-sell--muted {
      background: rgba(30, 41, 59, 0.95);
      border-color: rgba(255, 255, 255, 0.1);
      color: var(--rip-muted);
      box-shadow: none;
      font-weight: 600;
    }
    .itemHolder .rip-item-sell--link {
      text-decoration: none !important;
    }
    .itemHolder .rip-item-select {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 6;
      pointer-events: auto;
      width: 18px;
      height: 18px;
      accent-color: var(--rip-primary-to);
      cursor: pointer;
    }
    .itemHolder[data-rip-bulk-selected="1"] {
      outline: 2px solid var(--rip-link);
      outline-offset: -2px;
    }
    .itemHolder[data-rip-bulk-selected="1"] .${OVERLAY_CLASS} {
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rip-link) 45%, transparent);
    }

    #${HOST_ID} .rip-inv-draft-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(125, 211, 252, 0.28);
      color: var(--rip-link);
      font-size: 11px;
      font-weight: 600;
    }
    #${HOST_ID} .rip-inv-draft-chip button {
      border: 0;
      background: transparent;
      color: var(--rip-muted);
      cursor: pointer;
      font-size: 11px;
      padding: 0;
    }

    #${HOST_ID} .rip-inv-coach {
      margin-bottom: 8px;
      padding: 12px 14px;
      border-radius: 10px;
      background: linear-gradient(135deg, #1a2438 0%, #12161e 100%);
      border: 1px solid #3d5f8f;
      color: #e8e8e8;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
    }
    #${HOST_ID} .rip-inv-coach-title {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 700;
      color: #8eb7ff;
    }
    #${HOST_ID} .rip-inv-coach-body {
      margin: 0 0 10px;
      color: #a8adb8;
      font-size: 12px;
      line-height: 1.4;
    }
    #${HOST_ID} .rip-inv-coach-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    #${HOST_ID} .rip-inv-coach-dismiss {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 12px;
      border-radius: 8px;
      border: none;
      background: #5b8def;
      color: #fff;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
    }
    #${HOST_ID} .rip-inv-coach-hint {
      color: #7d8494;
      font-size: 11px;
    }

    #${HOST_ID} .rip-inv-trial {
      margin: 0 0 10px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(91, 141, 239, 0.45);
      background: rgba(91, 141, 239, 0.12);
    }
    #${HOST_ID} .rip-inv-trial-title {
      margin: 0 0 4px;
      font-size: 12px;
      font-weight: 700;
      color: #b7d0ff;
    }
    #${HOST_ID} .rip-inv-trial-body {
      margin: 0 0 8px;
      font-size: 11px;
      color: #c7ccd6;
      line-height: 1.35;
    }
    #${HOST_ID} .rip-inv-trial-dismiss {
      border: none;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11px;
      cursor: pointer;
      background: #2a2f3a;
      color: #e8e8e8;
    }

    #${HOST_ID} .rip-inv-checklist {
      margin-top: 8px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #161b24;
      border: 1px solid #2f3542;
    }
    #${HOST_ID} .rip-inv-checklist[data-ready="1"] {
      border-color: #2f6f46;
      background: #121a16;
    }
    #${HOST_ID} .rip-inv-checklist-head {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      align-items: baseline;
      margin-bottom: 8px;
    }
    #${HOST_ID} .rip-inv-checklist-title {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: #c9dcff;
    }
    #${HOST_ID} .rip-inv-checklist-summary {
      margin: 0;
      font-size: 11px;
      color: #7d8494;
    }
    #${HOST_ID} .rip-inv-checklist-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    #${HOST_ID} .rip-inv-checklist-item {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      align-items: flex-start;
      justify-content: space-between;
    }
    #${HOST_ID} .rip-inv-checklist-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      font-size: 11px;
      font-weight: 700;
      flex: 0 0 auto;
      margin-top: 1px;
    }
    #${HOST_ID} .rip-inv-checklist-item[data-ready="1"] .rip-inv-checklist-mark {
      background: #2f6f46;
      color: #b8f0c6;
    }
    #${HOST_ID} .rip-inv-checklist-item[data-ready="0"] .rip-inv-checklist-mark {
      background: #3a4250;
      color: #a8adb8;
    }
    #${HOST_ID} .rip-inv-checklist-copy {
      flex: 1 1 180px;
      min-width: 0;
    }
    #${HOST_ID} .rip-inv-checklist-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #e8e8e8;
    }
    #${HOST_ID} .rip-inv-checklist-hint {
      margin: 2px 0 0;
      font-size: 11px;
      color: #7d8494;
      line-height: 1.35;
    }
    #${HOST_ID} .rip-inv-checklist-action {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 7px;
      background: #2a303c;
      color: #8eb7ff !important;
      text-decoration: none !important;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }

    #${BULK_BAR_ID} {
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%);
      z-index: 99990;
      display: flex;
      flex-wrap: wrap;
      gap: 8px 10px;
      align-items: center;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(24, 28, 38, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f4f4f5;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 13px;
      box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
      max-width: min(680px, calc(100vw - 24px));
      backdrop-filter: blur(8px);
    }
    #${BULK_BAR_ID} .rip-bulk-count {
      font-weight: 750;
      color: #7dd3fc;
    }
    #${BULK_BAR_ID} .rip-bulk-meta {
      color: #94a3b8;
      font-size: 12px;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #${BULK_BAR_ID} .rip-bulk-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border-radius: 9px;
      border: none;
      font-size: 12px;
      font-weight: 650;
      cursor: pointer;
    }
    #${BULK_BAR_ID} .rip-bulk-btn--primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
    }
    #${BULK_BAR_ID} .rip-bulk-btn--secondary {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
    }
    #${BULK_BAR_ID} .rip-bulk-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    #${SELL_PANEL_ID} {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(11, 13, 18, 0.72);
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      backdrop-filter: blur(2px);
    }
    #${SELL_PANEL_ID} .rip-sell-card {
      width: min(440px, calc(100vw - 24px));
      background:
        linear-gradient(160deg, rgba(2, 132, 199, 0.1), transparent 40%),
        rgba(24, 28, 38, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 18px;
      color: #f4f4f5;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.55);
    }
    #${SELL_PANEL_ID} .rip-sell-eyebrow {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #7dd3fc;
    }
    #${SELL_PANEL_ID} .rip-sell-name-list {
      list-style: none;
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: grid;
      gap: 6px;
      max-height: 168px;
      overflow: auto;
    }
    #${SELL_PANEL_ID} .rip-sell-name-list li {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.35;
      color: #e2e8f0;
      word-break: break-word;
    }
    #${SELL_PANEL_ID} .rip-sell-name-more {
      margin: -4px 0 12px;
      font-size: 11px;
      color: #94a3b8;
    }
    #${SELL_PANEL_ID} .rip-sell-hero {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    #${SELL_PANEL_ID} .rip-sell-thumb {
      width: 72px;
      height: 72px;
      border-radius: 10px;
      object-fit: contain;
      background: #0b0d12;
      border: 1px solid rgba(255, 255, 255, 0.08);
      flex-shrink: 0;
    }
    #${SELL_PANEL_ID} .rip-sell-thumb-ph {
      width: 72px;
      height: 72px;
      border-radius: 10px;
      background: #0b0d12;
      border: 1px dashed rgba(255, 255, 255, 0.12);
      flex-shrink: 0;
    }
    #${SELL_PANEL_ID} .rip-sell-hero-text {
      min-width: 0;
      flex: 1;
    }
    #${SELL_PANEL_ID} .rip-sell-title {
      margin: 0 0 4px;
      font-size: 17px;
      font-weight: 750;
      color: #7dd3fc;
    }
    #${SELL_PANEL_ID} .rip-sell-item {
      margin: 0;
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.35;
      word-break: break-word;
    }
    #${SELL_PANEL_ID} .rip-sell-rails {
      margin: 0 0 12px;
      padding: 10px 10px 8px;
      border-radius: 8px;
      background: #0d1016;
      border: 1px solid #2a303c;
    }
    #${SELL_PANEL_ID} .rip-sell-rail {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      align-items: center;
      margin: 0 0 6px;
      font-size: 12px;
      color: #a8adb8;
      line-height: 1.35;
    }
    #${SELL_PANEL_ID} .rip-sell-rail:last-child {
      margin-bottom: 0;
    }
    #${SELL_PANEL_ID} .rip-sell-rail-apply {
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid #3a5278;
      background: #1a2436;
      color: #8eb7ff;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    #${SELL_PANEL_ID} .rip-sell-honesty {
      margin: 4px 0 0;
      font-size: 11px;
      color: #7d8494;
      line-height: 1.35;
    }
    #${SELL_PANEL_ID} .rip-sell-label {
      display: block;
      margin-bottom: 4px;
      font-size: 12px;
      color: #7d8494;
    }
    #${SELL_PANEL_ID} .rip-sell-input {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #3a4250;
      background: #0d1016;
      color: #fff;
      font-size: 15px;
      margin-bottom: 8px;
    }
    #${SELL_PANEL_ID} .rip-sell-preview {
      margin: 0 0 12px;
      font-size: 12px;
      color: #a8adb8;
      line-height: 1.4;
    }
    #${SELL_PANEL_ID} .rip-sell-preview strong {
      color: #8fe6a4;
      font-weight: 700;
    }
    #${SELL_PANEL_ID} .rip-sell-error {
      margin: 0 0 10px;
      color: #ffb4a8;
      font-size: 12px;
    }
    #${SELL_PANEL_ID} .rip-sell-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    #${SELL_PANEL_ID} .rip-sell-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 9px 12px;
      border-radius: 8px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none !important;
    }
    #${SELL_PANEL_ID} .rip-sell-btn:disabled {
      opacity: 0.6;
      cursor: wait;
    }
    #${SELL_PANEL_ID} .rip-sell-btn--primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
    }
    #${SELL_PANEL_ID} .rip-sell-btn--secondary {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
    }
    #${SELL_PANEL_ID} .rip-sell-preview strong {
      color: #86efac;
    }
    #${SELL_PANEL_ID} .rip-sell-success {
      margin: 0 0 12px;
      color: #8fe6a4;
      font-size: 14px;
      font-weight: 600;
    }

    #${TOAST_ID} {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 100000;
      max-width: min(360px, calc(100vw - 24px));
      padding: 12px 14px;
      border-radius: 10px;
      background: #12161e;
      border: 1px solid #2f6f46;
      color: #e8e8e8;
      font-family: "Segoe UI", system-ui, sans-serif;
      font-size: 13px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
    }
    #${TOAST_ID} a {
      color: #8eb7ff;
      font-weight: 600;
    }

    /* Selected-item rail — competitor parity next to Steam green Sell */
    #${SELECTED_SELL_RAIL_ID} {
      display: inline-flex;
      align-items: center;
      margin: 8px 8px 8px 0;
      vertical-align: middle;
    }
    #${SELECTED_SELL_RAIL_ID} .rip-selected-sell {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 148px;
      padding: 8px 14px;
      border-radius: 4px;
      border: 1px solid #3d7cff;
      background: linear-gradient(180deg, #5b8def 0%, #3d6fd4 100%);
      color: #fff !important;
      font-size: 13px;
      font-weight: 800;
      line-height: 1.2;
      text-decoration: none !important;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      font-family: "Segoe UI", system-ui, sans-serif;
    }
    #${SELECTED_SELL_RAIL_ID} .rip-selected-sell:hover {
      filter: brightness(1.08);
    }
    #${SELECTED_SELL_RAIL_ID} .rip-selected-sell--muted {
      background: #3a3f4a;
      border-color: #555b68;
      color: #d0d4dc !important;
    }
  `;
  document.documentElement.appendChild(style);
}

function findMountParent(): Element {
  return (
    document.querySelector('#inventory_pagecontrols')?.parentElement ??
    document.querySelector('#tabcontent_inventory') ??
    document.querySelector('.inventory_links')?.parentElement ??
    document.querySelector('#mainContents') ??
    document.querySelector('.responsive_page_template_content') ??
    document.body
  );
}

function ensureHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (host) {
    return host;
  }
  host = document.createElement('section');
  host.id = HOST_ID;
  host.setAttribute('data-rip-inventory-layer', '1');
  host.setAttribute(ATTR_READY, '0');
  host.setAttribute('aria-label', 'R.I.P Market inventory layer');

  const parent = findMountParent();
  const controls = document.querySelector('#inventory_pagecontrols');
  if (controls?.parentElement === parent) {
    parent.insertBefore(host, controls);
  } else {
    parent.prepend(host);
  }
  return host;
}

function removeHost(): void {
  if (coachAutoDismissTimer != null) {
    window.clearTimeout(coachAutoDismissTimer);
    coachAutoDismissTimer = null;
  }
  disconnectEnrichObserver();
  document.getElementById(HOST_ID)?.remove();
  clearItemOverlays();
  removeBulkBar();
}

async function loadOnboardingState(): Promise<InventorySellerOnboardingState> {
  try {
    const stored = await chrome.storage.local.get(INVENTORY_SELLER_ONBOARDING_KEY);
    return parseOnboardingState(stored[INVENTORY_SELLER_ONBOARDING_KEY]);
  } catch {
    return parseOnboardingState(null);
  }
}

async function saveOnboardingState(
  state: InventorySellerOnboardingState,
): Promise<void> {
  try {
    await chrome.storage.local.set({
      [INVENTORY_SELLER_ONBOARDING_KEY]: state,
    });
  } catch {
    // Best-effort local coach preference.
  }
}

async function loadSellerOnboardingFromRuntime(): Promise<{
  connected: boolean;
  tradeUrl: string | null;
  accountUrl: string;
}> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: TRADE_VERIFICATION_RUNTIME.GET_SELLER_ONBOARDING_STATUS,
    })) as
      | {
          ok?: boolean;
          connected?: boolean;
          tradeUrl?: string | null;
          accountUrl?: string;
        }
      | undefined;
    if (response?.ok) {
      return {
        connected: Boolean(response.connected),
        tradeUrl: response.tradeUrl ?? null,
        accountUrl:
          response.accountUrl?.trim() || siteAccountUrl(undefined),
      };
    }
  } catch {
    // Fall through to session-only.
  }
  const session = await getSessionState();
  return {
    connected: Boolean(session?.accessToken && session.apiBaseUrl),
    tradeUrl: null,
    accountUrl: siteAccountUrl(session?.apiBaseUrl),
  };
}

async function persistCoachDismiss(): Promise<void> {
  if (coachAutoDismissTimer != null) {
    window.clearTimeout(coachAutoDismissTimer);
    coachAutoDismissTimer = null;
  }
  const current = await loadOnboardingState();
  await saveOnboardingState(dismissCoachMark(current));
  void renderHostBar();
}

function scheduleCoachAutoDismiss(): void {
  if (coachAutoDismissTimer != null) {
    return;
  }
  coachAutoDismissTimer = window.setTimeout(() => {
    coachAutoDismissTimer = null;
    void persistCoachDismiss();
  }, COACH_AUTO_DISMISS_MS);
}

function clearItemOverlays(): void {
  disconnectEnrichObserver();
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((node) => node.remove());
  document.querySelectorAll(`[${ENRICH_ATTR}]`).forEach((node) => {
    node.removeAttribute(ENRICH_ATTR);
  });
  document.getElementById(SELECTED_SELL_RAIL_ID)?.remove();
}

async function resolveSteamId(): Promise<string | null> {
  return resolveInventoryPageSteamId({
    pathname: window.location.pathname,
    getHtml: () => document.documentElement.innerHTML,
  });
}

function scheduleSteamEnrichmentRecovery(): void {
  if (steamEnrichmentRetryTimer != null) {
    return;
  }
  steamEnrichmentRetryTimer = window.setTimeout(() => {
    steamEnrichmentRetryTimer = null;
    void enrichItemCards(true).then(() => {
      void renderHostBar();
    });
  }, STEAM_ENRICHMENT_RECOVERY_MS);
}

async function loadSteamFactsFromPageMain(
  steamId: string | null,
): Promise<PageEnrichmentLoadResult> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: TRADE_VERIFICATION_RUNTIME.GET_INVENTORY_PAGE_FACTS,
      steamId,
    })) as PageEnrichmentLoadResult & { ok?: boolean };
    return {
      facts: Array.isArray(response?.facts) ? response.facts : [],
      source: response?.source ?? 'empty',
      error: response?.error,
    };
  } catch (error) {
    return {
      facts: [],
      source: 'empty',
      error:
        error instanceof Error ? error.message : 'Steam page enrichment failed',
    };
  }
}

async function loadSteamFacts(
  force = false,
): Promise<Map<string, InventoryItemSteamFacts>> {
  const now = Date.now();
  if (
    !force &&
    steamFactsCache &&
    now - steamFactsCache.fetchedAt < STEAM_FACTS_TTL_MS
  ) {
    return steamFactsCache.byAssetId;
  }
  if (steamFactsInflight) {
    return steamFactsInflight;
  }

  if (!(await canProceedPastRateLimit())) {
    return steamFactsCache?.byAssetId ?? new Map();
  }

  const steamId = await resolveSteamId();

  steamFactsInflight = (async () => {
    // Product path: MAIN world first (page cookies + g_ActiveInventory).
    // Isolated fetch to /inventory/{id}/730/2 often gets Steam HTTP 500.
    const pageLoad = await loadSteamFactsFromPageMain(steamId);
    if (pageLoad.facts.length > 0) {
      const byAssetId = inventoryItemSteamFactsToMap(pageLoad.facts);
      steamFactsCache = { fetchedAt: Date.now(), byAssetId };
      steamEnrichmentDegraded = false;
      if (steamEnrichmentRetryTimer != null) {
        window.clearTimeout(steamEnrichmentRetryTimer);
        steamEnrichmentRetryTimer = null;
      }
      scheduleHostRender();
      return byAssetId;
    }

    if (steamId) {
      try {
        const byAssetId = await fetchCs2InventoryEnrichmentFacts(steamId);
        if (byAssetId.size > 0) {
          steamFactsCache = { fetchedAt: Date.now(), byAssetId };
          steamEnrichmentDegraded = false;
          if (steamEnrichmentRetryTimer != null) {
            window.clearTimeout(steamEnrichmentRetryTimer);
            steamEnrichmentRetryTimer = null;
          }
          scheduleHostRender();
          return byAssetId;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (/HTTP 429|rate.?limit/i.test(message)) {
          void noteRateLimitHit();
        }
        console.warn(
          '[rip-market] inventory enrichment API fallback failed',
          error,
        );
      }
    }

    console.warn(
      '[rip-market] inventory enrichment unavailable',
      pageLoad.error ?? 'no Steam facts',
    );
    steamEnrichmentDegraded = true;
    scheduleSteamEnrichmentRecovery();
    scheduleHostRender();
    return steamFactsCache?.byAssetId ?? new Map();
  })().finally(() => {
    steamFactsInflight = null;
  });

  return steamFactsInflight;
}

async function loadPlatformFacts(
  force = false,
): Promise<Record<string, InventoryItemPlatformFacts>> {
  const now = Date.now();
  if (
    !force &&
    platformFactsCache &&
    now - platformFactsCache.fetchedAt < PLATFORM_FACTS_TTL_MS
  ) {
    return platformFactsCache.byAssetId;
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: TRADE_VERIFICATION_RUNTIME.GET_INVENTORY_PLATFORM_STATUS,
    })) as {
      ok?: boolean;
      byAssetId?: Record<string, InventoryItemPlatformFacts>;
    };
    const byAssetId = response?.ok ? (response.byAssetId ?? {}) : {};
    platformFactsCache = { fetchedAt: Date.now(), byAssetId };
    return byAssetId;
  } catch {
    return platformFactsCache?.byAssetId ?? {};
  }
}

async function loadPriceHints(
  marketHashNames: string[],
  force = false,
): Promise<Record<string, InventoryPriceHintLike>> {
  const now = Date.now();
  if (
    !force &&
    priceHintsCache &&
    now - priceHintsCache.fetchedAt < PRICE_HINTS_TTL_MS
  ) {
    const missing = marketHashNames.filter((name) => !priceHintsCache!.byName[name]);
    if (missing.length === 0) {
      return priceHintsCache.byName;
    }
  }

  if (marketHashNames.length === 0) {
    return priceHintsCache?.byName ?? {};
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: TRADE_VERIFICATION_RUNTIME.GET_INVENTORY_PRICE_HINTS,
      marketHashNames,
      cacheOnly: true,
    })) as {
      ok?: boolean;
      hints?: Record<string, InventoryPriceHintLike>;
    };
    const next = {
      ...(priceHintsCache?.byName ?? {}),
      ...(response?.ok ? (response.hints ?? {}) : {}),
    };
    priceHintsCache = { fetchedAt: Date.now(), byName: next };
    return next;
  } catch {
    return priceHintsCache?.byName ?? {};
  }
}

function renderOverlayHtml(
  view: ReturnType<typeof buildInventoryItemEnrichmentView>,
  platform: InventoryItemPlatformFacts | null | undefined,
  sellAction: InventorySellAction,
  assetId: string,
  options: {
    bulkMode: boolean;
    selected: boolean;
    selectable: boolean;
    connected: boolean;
  },
): string {
  // Status only — brand lives in the host bar, not on every cell.
  const badges = view.badges
    .slice(0, 2)
    .map((badge) => {
      const href =
        badge.kind === 'listed'
          ? platform?.lotUrl
          : badge.kind === 'in_deal'
            ? platform?.orderUrl
            : null;
      const className = `rip-item-badge rip-item-badge--${badge.tone}`;
      if (href) {
        return `<a class="${className}" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(badge.label)}</a>`;
      }
      return `<span class="${className}">${escapeHtml(badge.label)}</span>`;
    })
    .join('');

  const wear =
    view.wearPointerPercent != null
      ? `<div class="rip-item-wear-track" aria-hidden="true"><i class="rip-item-wear-pointer" style="left:${view.wearPointerPercent.toFixed(2)}%"></i></div>`
      : '';
  const meta = view.metaLine
    ? `<div class="rip-item-meta">${escapeHtml(view.metaLine)}</div>`
    : '';
  const priceCompact = view.priceCompact
    ? `<div class="rip-item-price">${escapeHtml(view.priceCompact)}</div>`
    : '';
  const priceSecondary = view.priceSecondary
    ? `<div class="rip-item-price-sub">${escapeHtml(view.priceSecondary)}</div>`
    : '';
  const priceNet = view.priceNet
    ? `<div class="rip-item-price-net">${escapeHtml(view.priceNet)}</div>`
    : '';
  const priceBid =
    view.priceBid && view.priceCompact !== view.priceBid
      ? `<div class="rip-item-price-bid">${escapeHtml(view.priceBid)}</div>`
      : '';

  const detailParts = [meta, priceSecondary, priceBid, priceNet].filter(Boolean);
  const detail =
    detailParts.length > 0
      ? `<div class="rip-item-detail">${detailParts.join('')}</div>`
      : '';

  const selectBox =
    options.bulkMode && options.connected
      ? `<input class="rip-item-select" type="checkbox" data-rip-bulk-asset="${escapeHtml(assetId)}" ${options.selected ? 'checked' : ''} ${options.selectable ? '' : 'disabled'} aria-label="Выбрать для продажи" />`
      : '';

  let sellCta = '';
  if (!options.bulkMode) {
    if (sellAction.kind === 'open_lot' && sellAction.lotUrl) {
      sellCta = `<a class="rip-item-sell rip-item-sell--link" href="${escapeHtml(sellAction.lotUrl)}" target="_blank" rel="noreferrer" data-rip-sell-kind="open_lot" aria-label="Открыть лот на R.I.P">${escapeHtml(sellAction.label)}</a>`;
    } else if (sellAction.kind === 'manage') {
      sellCta = `<button type="button" class="rip-item-sell" data-rip-sell-kind="manage" data-rip-sell-asset="${escapeHtml(assetId)}" data-rip-lot-id="${escapeHtml(sellAction.lotId ?? '')}" aria-label="Управлять лотом на R.I.P">${escapeHtml(sellAction.label)}</button>`;
    } else {
      const muted =
        sellAction.kind === 'blocked' ? ' rip-item-sell--muted' : '';
      sellCta = `<button type="button" class="rip-item-sell${muted}" data-rip-sell-kind="${escapeHtml(sellAction.kind)}" data-rip-sell-asset="${escapeHtml(assetId)}" aria-label="Продать на R.I.P">${escapeHtml(sellAction.label)}</button>`;
    }
  }

  const badgesBlock = badges
    ? `<div class="rip-item-badges">${badges}</div>`
    : `<div class="rip-item-badges" aria-hidden="true"></div>`;

  return `
    ${selectBox}
    ${badgesBlock}
    <div class="rip-item-footer">${wear}${priceCompact}${detail}${sellCta}</div>
  `;
}

type SellPanelContext = {
  assetId: string;
  marketHashName: string;
  iconUrl: string | null;
  inventoryAssetId: string | null;
  defaultPriceMinor: number | null;
  priceHint: InventoryPriceHintLike | null;
  action: InventorySellAction;
  accountUrl: string;
  sellUrl: string;
};

function buildSellHeroHtml(ctx: {
  title: string;
  marketHashName: string;
  iconUrl?: string | null;
}): string {
  const thumb = ctx.iconUrl
    ? `<img class="rip-sell-thumb" src="${escapeHtml(ctx.iconUrl)}" alt="" />`
    : `<div class="rip-sell-thumb-ph" aria-hidden="true"></div>`;
  return `
    <div class="rip-sell-hero">
      ${thumb}
      <div class="rip-sell-hero-text">
        <p class="rip-sell-title">${escapeHtml(ctx.title)}</p>
        <p class="rip-sell-item">${escapeHtml(ctx.marketHashName)}</p>
      </div>
    </div>`;
}

function buildSellPriceRailsHtml(hint: InventoryPriceHintLike | null): string {
  const rails = resolveSellPanelPriceRails(hint);
  const rows: string[] = [];
  if (rails.steamLine) {
    rows.push(`<div class="rip-sell-rail">${escapeHtml(rails.steamLine)}</div>`);
  }
  if (rails.medianLine) {
    rows.push(`<div class="rip-sell-rail">${escapeHtml(rails.medianLine)}</div>`);
  }
  if (rails.recommendedLine && rails.recommendedMinor != null) {
    rows.push(`
      <div class="rip-sell-rail">
        <span>${escapeHtml(rails.recommendedLine)}</span>
        <button type="button" class="rip-sell-rail-apply" data-rip-apply-price="${rails.recommendedMinor}">Подставить</button>
      </div>`);
  }
  if (rails.bidLine) {
    rows.push(`<div class="rip-sell-rail">${escapeHtml(rails.bidLine)}</div>`);
  }
  if (rails.honestyLine) {
    rows.push(
      `<p class="rip-sell-honesty">${escapeHtml(rails.honestyLine)}</p>`,
    );
  }
  if (rows.length === 0) {
    return '';
  }
  return `<div class="rip-sell-rails">${rows.join('')}</div>`;
}

function closeSellPanel(): void {
  document.getElementById(SELL_PANEL_ID)?.remove();
}

function showSellToast(params: {
  message: string;
  lotUrl?: string | null;
  listingsUrl?: string | null;
}): void {
  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  const links: string[] = [];
  if (params.lotUrl) {
    links.push(
      `<a href="${escapeHtml(params.lotUrl)}" target="_blank" rel="noreferrer">Открыть лот</a>`,
    );
  }
  if (params.listingsUrl) {
    links.push(
      `<a href="${escapeHtml(params.listingsUrl)}" target="_blank" rel="noreferrer">Мои объявления</a>`,
    );
  }
  toast.innerHTML = `<div>${escapeHtml(params.message)}</div>${
    links.length
      ? `<div style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap">${links.join('')}</div>`
      : ''
  }`;
  document.documentElement.appendChild(toast);
  window.setTimeout(() => toast.remove(), 8_000);
}

function updateSellPreview(panel: HTMLElement): void {
  const input = panel.querySelector<HTMLInputElement>('.rip-sell-input');
  const previewEl = panel.querySelector<HTMLElement>('[data-rip-sell-commission]');
  const errorEl = panel.querySelector<HTMLElement>('.rip-sell-error');
  if (!input || !previewEl) {
    return;
  }
  const priceMinor = parseUsdInputToMinor(input.value);
  const preview = priceMinor != null ? buildInventorySellPreview(priceMinor) : null;
  if (!preview) {
    previewEl.textContent = 'Введите цену — покажем комиссию и «вам».';
    if (errorEl && input.value.trim()) {
      errorEl.textContent = validateCreateLotPriceMinor(null) ?? '';
    } else if (errorEl) {
      errorEl.textContent = '';
    }
    return;
  }
  previewEl.innerHTML = `${escapeHtml(preview.commissionLine)} · <strong>${escapeHtml(preview.receiveLine)}</strong>`;
  if (errorEl) {
    errorEl.textContent = '';
  }
}

function openSellPanel(ctx: SellPanelContext): void {
  ensureStyles();
  closeSellPanel();

  const panel = document.createElement('div');
  panel.id = SELL_PANEL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Продать на R.I.P');

  if (ctx.action.kind === 'pair') {
    panel.innerHTML = `
      <div class="rip-sell-card">
        ${buildSellHeroHtml({
          title: 'Продать на R.I.P',
          marketHashName: ctx.marketHashName,
          iconUrl: ctx.iconUrl,
        })}
        <p class="rip-sell-preview">${escapeHtml(ctx.action.blockMessage ?? 'Сначала подключите расширение на сайте.')}</p>
        <div class="rip-sell-actions">
          <a class="rip-sell-btn rip-sell-btn--primary" href="${escapeHtml(ctx.accountUrl)}" target="_blank" rel="noreferrer">Подключить на сайте</a>
          <button type="button" class="rip-sell-btn rip-sell-btn--secondary" data-rip-sell-close>Отмена</button>
        </div>
      </div>
    `;
  } else if (ctx.action.kind === 'blocked') {
    panel.innerHTML = `
      <div class="rip-sell-card">
        ${buildSellHeroHtml({
          title: 'Пока нельзя выставить',
          marketHashName: ctx.marketHashName,
          iconUrl: ctx.iconUrl,
        })}
        <p class="rip-sell-preview">${escapeHtml(ctx.action.blockMessage ?? 'Предмет нельзя выставить сейчас.')}</p>
        <div class="rip-sell-actions">
          ${
            ctx.action.lotUrl
              ? `<a class="rip-sell-btn rip-sell-btn--primary" href="${escapeHtml(ctx.action.lotUrl)}" target="_blank" rel="noreferrer">${
                  ctx.action.blockReason === 'active_trade_task' ||
                  ctx.action.blockReason === 'in_deal'
                    ? 'Открыть заказ'
                    : 'Открыть'
                }</a>`
              : `<a class="rip-sell-btn rip-sell-btn--primary" href="${escapeHtml(ctx.sellUrl)}" target="_blank" rel="noreferrer">Инвентарь на сайте</a>`
          }
          <button type="button" class="rip-sell-btn rip-sell-btn--secondary" data-rip-sell-close>Закрыть</button>
        </div>
      </div>
    `;
  } else {
    const bidOffer = resolveBidListOffer(ctx.priceHint);
    const draftPrice =
      sellDraftPriceByAsset?.assetId === ctx.assetId
        ? sellDraftPriceByAsset.priceInput
        : null;
    const defaultValue =
      draftPrice ??
      (ctx.defaultPriceMinor != null
        ? formatUsdInputFromMinor(ctx.defaultPriceMinor)
        : '');
    const bidBlock = bidOffer.available
      ? `
        <p class="rip-sell-preview" data-rip-bid-hint>${escapeHtml(bidOffer.hintLine ?? '')}</p>
        <p class="rip-sell-preview" style="color:#7d8494;font-size:11px">${escapeHtml(bidOffer.honestyLine)}</p>
        <div class="rip-sell-actions" style="margin-bottom:10px">
          <button type="button" class="rip-sell-btn rip-sell-btn--primary" data-rip-sell-bid>${escapeHtml(bidOffer.buttonLabel ?? 'По bid')}</button>
        </div>
      `
      : '';
    panel.innerHTML = `
      <div class="rip-sell-card">
        ${buildSellHeroHtml({
          title: 'Продать на R.I.P',
          marketHashName: ctx.marketHashName,
          iconUrl: ctx.iconUrl,
        })}
        ${buildSellPriceRailsHtml(ctx.priceHint)}
        ${bidBlock}
        <label class="rip-sell-label" for="rip-sell-price">Цена ($)</label>
        <input id="rip-sell-price" class="rip-sell-input" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(defaultValue)}" placeholder="0.00" />
        <p class="rip-sell-preview" data-rip-sell-commission></p>
        <p class="rip-sell-error" data-testid="rip-sell-error"></p>
        <div class="rip-sell-actions">
          <button type="button" class="rip-sell-btn rip-sell-btn--primary" data-rip-sell-confirm>Выставить</button>
          <button type="button" class="rip-sell-btn rip-sell-btn--secondary" data-rip-sell-close>Отмена</button>
        </div>
      </div>
    `;
  }

  document.documentElement.appendChild(panel);
  updateSellPreview(panel);

  panel.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target === panel || target?.closest?.('[data-rip-sell-close]')) {
      closeSellPanel();
    }
  });

  panel
    .querySelector('.rip-sell-input')
    ?.addEventListener('input', () => {
      const input = panel.querySelector<HTMLInputElement>('.rip-sell-input');
      const value = input?.value?.trim() ?? '';
      if (value) {
        sellDraftPriceByAsset = {
          assetId: ctx.assetId,
          priceInput: value,
        };
      } else if (sellDraftPriceByAsset?.assetId === ctx.assetId) {
        sellDraftPriceByAsset = null;
      }
      persistSellDraft();
      updateSellPreview(panel);
    });

  panel.querySelectorAll<HTMLButtonElement>('[data-rip-apply-price]').forEach((button) => {
    button.addEventListener('click', () => {
      const minor = Number(button.dataset.ripApplyPrice);
      const input = panel.querySelector<HTMLInputElement>('.rip-sell-input');
      if (!input || !Number.isFinite(minor) || minor <= 0) {
        return;
      }
      input.value = formatUsdInputFromMinor(minor);
      sellDraftPriceByAsset = {
        assetId: ctx.assetId,
        priceInput: input.value,
      };
      persistSellDraft();
      updateSellPreview(panel);
    });
  });

  panel
    .querySelector('[data-rip-sell-confirm]')
    ?.addEventListener('click', () => {
      void submitSellFromPanel(panel, ctx);
    });

  panel
    .querySelector('[data-rip-sell-bid]')
    ?.addEventListener('click', () => {
      const bidOffer = resolveBidListOffer(ctx.priceHint);
      const input = panel.querySelector<HTMLInputElement>('.rip-sell-input');
      if (!bidOffer.available || bidOffer.priceMinor == null || !input) {
        return;
      }
      input.value = formatUsdInputFromMinor(bidOffer.priceMinor);
      updateSellPreview(panel);
      void submitSellFromPanel(panel, ctx);
    });

  panel.querySelector<HTMLInputElement>('.rip-sell-input')?.focus();
}

async function submitSellFromPanel(
  panel: HTMLElement,
  ctx: SellPanelContext,
): Promise<void> {
  const input = panel.querySelector<HTMLInputElement>('.rip-sell-input');
  const errorEl = panel.querySelector<HTMLElement>('.rip-sell-error');
  const confirmBtn = panel.querySelector<HTMLButtonElement>(
    '[data-rip-sell-confirm]',
  );
  const bidBtn = panel.querySelector<HTMLButtonElement>('[data-rip-sell-bid]');
  const priceMinor = parseUsdInputToMinor(input?.value ?? '');
  const priceError = validateCreateLotPriceMinor(priceMinor);
  if (priceError || priceMinor == null) {
    if (errorEl) {
      errorEl.textContent = priceError ?? 'Введите цену';
    }
    return;
  }

  const setBusy = (busy: boolean, label = 'Выставить') => {
    if (confirmBtn) {
      confirmBtn.disabled = busy;
      confirmBtn.textContent = busy ? 'Выставляем…' : label;
    }
    if (bidBtn) {
      bidBtn.disabled = busy;
    }
  };

  setBusy(true);
  if (errorEl) {
    errorEl.textContent = '';
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: TRADE_VERIFICATION_RUNTIME.CREATE_INVENTORY_LOT,
      steamAssetId: ctx.assetId,
      inventoryAssetId: ctx.inventoryAssetId,
      priceMinor,
    })) as {
      ok?: boolean;
      lotId?: string;
      lotUrl?: string;
      listingsUrl?: string;
      error?: string;
      errorCode?: string;
    };

    if (!response?.ok) {
      const code = response?.errorCode ?? null;
      const message = humanizeListingApiError({
        code,
        message: response?.error,
      });
      if (errorEl) {
        errorEl.textContent = message;
      }
      const hardBan = isHardSteamTradeBanCode(code);
      if (confirmBtn) {
        confirmBtn.disabled = hardBan;
        confirmBtn.textContent = hardBan
          ? 'Выставить нельзя'
          : isRetryableLabel(code)
            ? 'Повторить'
            : 'Выставить';
      }
      if (bidBtn) {
        bidBtn.disabled = hardBan;
      }
      return;
    }

    void recordTwoMinuteFirstList().catch(() => undefined);

    if (sellDraftPriceByAsset?.assetId === ctx.assetId) {
      sellDraftPriceByAsset = null;
    }
    bulkSelected.delete(ctx.assetId);
    persistSellDraft();

    const card = panel.querySelector('.rip-sell-card');
    if (card) {
      card.innerHTML = `
        <p class="rip-sell-title">Выставлено</p>
        <p class="rip-sell-success">Лот на R.I.P создан.</p>
        <p class="rip-sell-item">${escapeHtml(ctx.marketHashName)}</p>
        <div class="rip-sell-actions">
          ${
            response.lotUrl
              ? `<a class="rip-sell-btn rip-sell-btn--primary" href="${escapeHtml(response.lotUrl)}" target="_blank" rel="noreferrer">Открыть лот</a>`
              : ''
          }
          ${
            response.listingsUrl
              ? `<a class="rip-sell-btn rip-sell-btn--secondary" href="${escapeHtml(response.listingsUrl)}" target="_blank" rel="noreferrer">Мои объявления</a>`
              : ''
          }
          <button type="button" class="rip-sell-btn rip-sell-btn--secondary" data-rip-sell-close>Закрыть</button>
        </div>
      `;
      card
        .querySelector('[data-rip-sell-close]')
        ?.addEventListener('click', () => closeSellPanel());
    }

    showSellToast({
      message: 'Лот выставлен на R.I.P',
      lotUrl: response.lotUrl,
      listingsUrl: response.listingsUrl,
    });

    platformFactsCache = null;
    scheduleEnrichment(false);
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = humanizeListingApiError({
        message: error instanceof Error ? error.message : 'Не удалось выставить лот',
      });
    }
    setBusy(false);
  }
}

function isRetryableLabel(code: string | null | undefined): boolean {
  return code === 'STEAM_BAN_CHECK_UNAVAILABLE';
}

function applyEnrichmentToHolder(
  holder: Element,
  steamFacts: Map<string, InventoryItemSteamFacts>,
  platformFacts: Record<string, InventoryItemPlatformFacts>,
  priceHints: Record<string, InventoryPriceHintLike>,
  connected: boolean,
): void {
  const item = holder.querySelector<HTMLElement>(CS2_INVENTORY_ITEM_SELECTOR);
  const assetId = parseAssetIdFromItemElementId(item?.id);
  if (!assetId || !item) {
    return;
  }
  // Product: never skip overlay when the cell is on screen — DOM baseline must exist.
  const steam =
    steamFacts.get(assetId) ??
    ({
      assetId,
      marketHashName: platformFacts[assetId]?.marketHashName ?? null,
      floatValue: null,
      paintSeed: null,
      wear: null,
      tradable: true,
      marketable: true,
      tradeLockUntil: null,
    } satisfies InventoryItemSteamFacts);
  const platform = platformFacts[assetId] ?? null;
  const resolvedName =
    steam.marketHashName?.trim() || platform?.marketHashName?.trim() || null;
  const priceHint = resolvedName ? (priceHints[resolvedName] ?? null) : null;
  const view = buildInventoryItemEnrichmentView({
    steam: { ...steam, marketHashName: resolvedName },
    platform,
    priceHint,
  });
  const sellAction = resolveInventorySellAction({
    connected,
    siteSafeMode: lastSiteSafeMode,
    steam: { ...steam, marketHashName: resolvedName },
    platform,
  });

  // Mount on Steam's .item node so the overlay sits above the skin artwork.
  const mountRoot = item;
  let overlay = mountRoot.querySelector<HTMLElement>(`.${OVERLAY_CLASS}`);
  if (!overlay) {
    // Migrate any holder-level overlay from older builds.
    holder.querySelector(`.${OVERLAY_CLASS}`)?.remove();
    overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute('data-rip-asset-id', assetId);
    mountRoot.appendChild(overlay);
  }
  overlay.setAttribute(
    'data-rip-inventory-asset-id',
    platform?.inventoryAssetId ?? '',
  );
  overlay.setAttribute('data-rip-lot-id', platform?.lotId ?? '');
  overlay.setAttribute(
    'data-rip-listed-price-minor',
    platform?.listedPriceMinor ?? '',
  );
  overlay.setAttribute('data-rip-market-hash-name', resolvedName ?? '');
  const defaultMinor = resolveDefaultListPriceMinor(priceHint);
  if (defaultMinor != null) {
    overlay.setAttribute('data-rip-default-price-minor', String(defaultMinor));
  } else {
    overlay.removeAttribute('data-rip-default-price-minor');
  }
  overlay.innerHTML = renderOverlayHtml(
    view,
    platform,
    sellAction,
    assetId,
    {
      bulkMode,
      selected: bulkSelected.has(assetId),
      connected,
      selectable: canSelectForBulkSell({
        connected,
        steam: {
          tradable: steam.tradable,
          marketable: steam.marketable,
          tradeLockUntil: steam.tradeLockUntil,
        },
        platform,
      }),
    },
  );
  holder.setAttribute(ENRICH_ATTR, '1');
  holder.setAttribute(
    'data-rip-bulk-selected',
    bulkMode && bulkSelected.has(assetId) ? '1' : '0',
  );
}

function disconnectEnrichObserver(): void {
  enrichObserver?.disconnect();
  enrichObserver = null;
  deferredEnrichQueue = [];
  deferredEnrichContext = null;
  if (deferredEnrichRaf != null) {
    cancelAnimationFrame(deferredEnrichRaf);
    deferredEnrichRaf = null;
  }
}

function flushDeferredEnrichBatch(): void {
  deferredEnrichRaf = null;
  const ctx = deferredEnrichContext;
  if (!ctx || deferredEnrichQueue.length === 0) {
    return;
  }
  const batch = deferredEnrichQueue.splice(0, LAZY_ENRICH_BATCH_SIZE);
  for (const holder of batch) {
    if (!(holder as HTMLElement).isConnected) {
      continue;
    }
    if (holder.getAttribute(ENRICH_ATTR) === '1') {
      continue;
    }
    applyEnrichmentToHolder(
      holder,
      ctx.steamFacts,
      ctx.platformFacts,
      ctx.priceHints,
      ctx.connected,
    );
  }
  if (deferredEnrichQueue.length > 0) {
    deferredEnrichRaf = window.requestAnimationFrame(() => {
      flushDeferredEnrichBatch();
    });
  }
}

function enqueueDeferredEnrich(holders: Element[]): void {
  for (const holder of holders) {
    deferredEnrichQueue.push(holder);
  }
  if (deferredEnrichRaf == null && deferredEnrichQueue.length > 0) {
    deferredEnrichRaf = window.requestAnimationFrame(() => {
      flushDeferredEnrichBatch();
    });
  }
}

function ensureEnrichObserver(): IntersectionObserver {
  if (enrichObserver) {
    return enrichObserver;
  }
  enrichObserver = new IntersectionObserver(
    (entries) => {
      const due: Element[] = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const holder = entry.target;
        enrichObserver?.unobserve(holder);
        if (holder.getAttribute(ENRICH_ATTR) === '1') {
          continue;
        }
        due.push(holder);
      }
      if (due.length > 0) {
        enqueueDeferredEnrich(due);
      }
    },
    {
      root: null,
      rootMargin: `${LAZY_ENRICH_VIEWPORT_MARGIN_PX}px`,
      threshold: 0.01,
    },
  );
  return enrichObserver;
}

function paintInventoryOverlays(params: {
  steamFacts: Map<string, InventoryItemSteamFacts>;
  platformFacts: Record<string, InventoryItemPlatformFacts>;
  priceHints: Record<string, InventoryPriceHintLike>;
  connected: boolean;
}): void {
  const cells = listPaintableCs2InventoryCells(document);
  const holders = cells.map((cell) => cell.holder);

  if (holders.length === 0) {
    const cs2Cells = document.querySelectorAll(CS2_INVENTORY_ITEM_SELECTOR)
      .length;
    if (cs2Cells > 0) {
      console.warn(
        '[rip-market] inventory overlay: CS2 cells present but no paintable holders',
        { cs2Cells },
      );
    }
  }

  deferredEnrichContext = {
    steamFacts: params.steamFacts,
    platformFacts: params.platformFacts,
    priceHints: params.priceHints,
    connected: params.connected,
  };

  // Product: visible page is typically ≤50 cells — paint all immediately.
  // Lazy/IO only kicks in for unusually large visible sets.
  const { immediate, deferred } =
    holders.length > 80
      ? partitionHoldersForEnrich(holders)
      : { immediate: holders, deferred: [] as Element[] };

  for (const holder of immediate) {
    holder.removeAttribute(ENRICH_ATTR);
    applyEnrichmentToHolder(
      holder,
      params.steamFacts,
      params.platformFacts,
      params.priceHints,
      params.connected,
    );
  }

  const observer = ensureEnrichObserver();
  for (const holder of deferred) {
    holder.removeAttribute(ENRICH_ATTR);
    observer.observe(holder);
  }
  renderBulkBar();
  syncSelectedSellRail({
    steamFacts: params.steamFacts,
    platformFacts: params.platformFacts,
    priceHints: params.priceHints,
    connected: params.connected,
  });
}

function syncSelectedSellRail(params: {
  steamFacts: Map<string, InventoryItemSteamFacts>;
  platformFacts: Record<string, InventoryItemPlatformFacts>;
  priceHints: Record<string, InventoryPriceHintLike>;
  connected: boolean;
}): void {
  const actionsRoot = findVisibleItemActionsRoot(document);
  if (!actionsRoot) {
    document.getElementById(SELECTED_SELL_RAIL_ID)?.remove();
    return;
  }

  const selected = readSelectedCs2ItemFromDom(document, {
    lastClickedAssetId,
  });
  const model = buildSelectedSellRailModel({
    selected,
    connected: params.connected,
    siteSafeMode: lastSiteSafeMode,
    label: 'Продать на R.I.P',
  });

  let rail = document.getElementById(SELECTED_SELL_RAIL_ID);
  if (!model.visible || !model.assetId) {
    rail?.remove();
    return;
  }

  if (!rail || rail.parentElement !== actionsRoot) {
    rail?.remove();
    rail = document.createElement('span');
    rail.id = SELECTED_SELL_RAIL_ID;
    // Place immediately after Steam green Sell when present.
    const steamSell = actionsRoot.querySelector(
      'a.item_market_action_button_green, a.item_market_action_button, a[href*="SellCurrentSelection"]',
    );
    if (steamSell?.nextSibling) {
      actionsRoot.insertBefore(rail, steamSell.nextSibling);
    } else if (steamSell) {
      steamSell.insertAdjacentElement('afterend', rail);
    } else {
      actionsRoot.appendChild(rail);
    }
  }

  const muted = model.kind === 'blocked' ? ' rip-selected-sell--muted' : '';
  rail.innerHTML = `<button type="button" class="rip-selected-sell${muted}" data-rip-sell-kind="${escapeHtml(model.kind)}" data-rip-sell-asset="${escapeHtml(model.assetId)}" aria-label="Продать на R.I.P">${escapeHtml(model.label)}</button>`;
}

async function enrichItemCards(forceSteam = false): Promise<void> {
  if (
    !isCs2InventoryActive({
      pathname: window.location.pathname,
      hash: window.location.hash,
      document,
    })
  ) {
    clearItemOverlays();
    removeBulkBar();
    document.getElementById(SELECTED_SELL_RAIL_ID)?.remove();
    disconnectEnrichObserver();
    return;
  }

  ensureStyles();

  // 1) DOM paint FIRST — zero chrome.* dependency. Grid + selected rail always mount.
  const domFacts = buildDomBaselineSteamFacts(document);
  paintInventoryOverlays({
    steamFacts: steamFactsCache?.byAssetId
      ? mergeSteamFactsMaps(domFacts, steamFactsCache.byAssetId)
      : domFacts,
    platformFacts: platformFactsCache?.byAssetId ?? {},
    priceHints: priceHintsCache?.byName ?? {},
    connected: lastConnected,
  });

  if (!isExtensionContextValid()) {
    extensionContextInvalidated = true;
    scheduleHostRender();
    return;
  }

  // 2) Session + platform (may soft-fail after extension reload)
  let connected = lastConnected;
  try {
    const session = await getSessionState();
    connected = Boolean(session?.accessToken && session.apiBaseUrl);
    lastConnected = connected;
    extensionContextInvalidated = false;
  } catch {
    extensionContextInvalidated = !isExtensionContextValid();
    connected = false;
    lastConnected = false;
  }

  if (!connected && bulkMode) {
    bulkMode = false;
    bulkSelected = new Set();
  }

  const platformFacts = connected ? await loadPlatformFacts(false) : {};
  const namedDom = applyPlatformNamesToSteamFacts(domFacts, platformFacts);
  steamFactsCache = {
    fetchedAt: steamFactsCache?.fetchedAt ?? Date.now(),
    byAssetId: namedDom,
  };

  const earlyNames: string[] = [];
  for (const fact of namedDom.values()) {
    if (fact.marketHashName) {
      earlyNames.push(fact.marketHashName);
    }
  }
  const earlyHints = connected
    ? await loadPriceHints(earlyNames, false)
    : {};

  paintInventoryOverlays({
    steamFacts: namedDom,
    platformFacts,
    priceHints: earlyHints,
    connected,
  });
  tryRestoreSellDraft(new Set(namedDom.keys()));
  steamEnrichmentDegraded = false;
  scheduleHostRender();

  // 3) Progressive Steam enrichment
  void (async () => {
    if (!isExtensionContextValid()) {
      extensionContextInvalidated = true;
      scheduleHostRender();
      return;
    }
    const enriched = await loadSteamFacts(forceSteam);
    const merged = applyPlatformNamesToSteamFacts(
      mergeSteamFactsMaps(namedDom, enriched),
      platformFacts,
    );
    steamFactsCache = { fetchedAt: Date.now(), byAssetId: merged };

    const names: string[] = [];
    for (const fact of merged.values()) {
      if (fact.marketHashName) {
        names.push(fact.marketHashName);
      }
    }
    const priceHints = connected ? await loadPriceHints(names, false) : {};
    const enrichmentEmpty = enriched.size === 0 && namedDom.size > 0;
    steamEnrichmentDegraded = enrichmentEmpty;
    scheduleHostRender();
    paintInventoryOverlays({
      steamFacts: merged,
      platformFacts,
      priceHints,
      connected,
    });
  })().catch((error) => {
    console.warn('[rip-market] progressive inventory enrichment failed', error);
    if (!isExtensionContextValid()) {
      extensionContextInvalidated = true;
    }
    steamEnrichmentDegraded = true;
    scheduleHostRender();
  });
}

async function renderHostBar(): Promise<void> {
  if (!isSteamInventoryPath(window.location.pathname)) {
    removeHost();
    removeBulkBar();
    return;
  }

  const cs2Active = isCs2InventoryActive({
    pathname: window.location.pathname,
    hash: window.location.hash,
    document,
  });

  if (!cs2Active) {
    removeHost();
    removeBulkBar();
    return;
  }

  ensureStyles();
  const host = ensureHost();

  if (!isExtensionContextValid()) {
    extensionContextInvalidated = true;
  }

  const session = extensionContextInvalidated
    ? null
    : await getSessionState();
  const connected = Boolean(session?.accessToken && session.apiBaseUrl);
  if (!extensionContextInvalidated) {
    lastConnected = connected;
  }
  if (!connected && bulkMode) {
    bulkMode = false;
    bulkSelected = new Set();
  }
  const itemHolderCount = countVisibleCs2InventoryItemHolders(document);
  let siteLinkSafeMode = lastSiteSafeMode;
  if (!extensionContextInvalidated) {
    try {
      const siteLink = await getStoredSiteLinkSnapshot();
      siteLinkSafeMode = Boolean(siteLink.safeMode);
    } catch {
      extensionContextInvalidated = !isExtensionContextValid();
    }
  }
  lastSiteSafeMode = siteLinkSafeMode;
  if (connected && !extensionContextInvalidated) {
    void recordTwoMinuteInventoryVisit().catch(() => undefined);
  }
  const view = resolveInventoryLayerView({
    connected: connected && !extensionContextInvalidated,
    siteSafeMode: lastSiteSafeMode,
    sellUrl: siteSellInventoryUrl(session?.apiBaseUrl),
    listingsUrl: siteListingsPageUrl(session?.apiBaseUrl),
    accountUrl: siteAccountUrl(session?.apiBaseUrl),
    itemHolderCount,
  });

  const [onboardingState, sellerStatus, locale] = extensionContextInvalidated
    ? [
        parseOnboardingState(null),
        {
          connected: false,
          tradeUrl: null,
          accountUrl: siteAccountUrl(null),
        },
        'ru' as const,
      ]
    : await Promise.all([
        loadOnboardingState(),
        loadSellerOnboardingFromRuntime(),
        getStoredExtensionLocale(),
      ]);
  const t = createExtensionT(locale);
  const checklist = resolveSellerChecklistView({
    extensionConnected: sellerStatus.connected || connected,
    tradeUrl: sellerStatus.tradeUrl,
    accountUrl: sellerStatus.accountUrl || siteAccountUrl(session?.apiBaseUrl),
    locale,
  });
  const coach = resolveCoachMarkView({ state: onboardingState, locale });
  const twoMinState = extensionContextInvalidated
    ? defaultTwoMinuteOnboardingState()
    : await getTwoMinuteOnboardingState();
  const trial = resolveTrialListHintView({
    connected: connected && !extensionContextInvalidated,
    checklistReady: checklist.allReady,
    state: twoMinState,
    locale,
  });

  if (coach.visible && !coachMarkedSeenThisSession) {
    coachMarkedSeenThisSession = true;
    void saveOnboardingState(markCoachSeen(onboardingState));
  }
  if (coach.visible) {
    scheduleCoachAutoDismiss();
  } else if (coachAutoDismissTimer != null) {
    window.clearTimeout(coachAutoDismissTimer);
    coachAutoDismissTimer = null;
  }

  host.setAttribute('data-connection', view.connection);
  host.setAttribute('data-item-holders', String(view.itemHolderCount));
  host.setAttribute(ATTR_READY, '1');
  host.setAttribute('data-appid', '730');
  host.setAttribute('data-bulk-mode', bulkMode ? '1' : '0');
  host.setAttribute('data-onboarding-ready', checklist.allReady ? '1' : '0');
  host.setAttribute('data-coach', coach.visible ? '1' : '0');

  const bulkToggle = connected && !lastSiteSafeMode
    ? `<button type="button" class="rip-inv-bulk-toggle" data-rip-bulk-toggle data-active="${bulkMode ? '1' : '0'}">${
        bulkMode ? 'Мультивыбор · вкл' : 'Выбрать несколько'
      }</button>`
    : '';

  const draftChip = sellDraftRestoreChip
    ? `<span class="rip-inv-draft-chip" data-testid="rip-inv-draft-chip" data-rip-draft-chip>
        ${escapeHtml(sellDraftRestoreChip)}
        <button type="button" data-rip-draft-dismiss aria-label="Скрыть">✕</button>
      </span>`
    : '';

  const browserAssistBtn =
    connected && !extensionContextInvalidated && !lastSiteSafeMode
      ? `<button type="button" class="rip-inv-cta-secondary" data-rip-browser-assist ${
          browserAssistBusy ? 'disabled' : ''
        }>${browserAssistBusy ? 'Синхронизация…' : 'Синхронизировать с сайтом'}</button>`
      : '';

  const coachHtml = coach.visible
    ? `<div class="rip-inv-coach" data-rip-coach role="status">
        <p class="rip-inv-coach-title">${escapeHtml(coach.title)}</p>
        <p class="rip-inv-coach-body">${escapeHtml(coach.body)}</p>
        <div class="rip-inv-coach-actions">
          <button type="button" class="rip-inv-coach-dismiss" data-rip-coach-dismiss>${escapeHtml(coach.dismissLabel)}</button>
          <span class="rip-inv-coach-hint">${escapeHtml(t('onboarding.autoHideHint'))}</span>
        </div>
      </div>`
    : '';

  const trialHtml = trial.visible
    ? `<div class="rip-inv-trial" data-rip-trial role="status">
        <p class="rip-inv-trial-title">${escapeHtml(trial.title)}</p>
        <p class="rip-inv-trial-body">${escapeHtml(trial.body)}</p>
        <button type="button" class="rip-inv-trial-dismiss" data-rip-trial-dismiss>${escapeHtml(trial.dismissLabel)}</button>
      </div>`
    : '';

  const checklistItemsHtml = checklist.allReady
    ? ''
    : `<ul class="rip-inv-checklist-list">
        ${checklist.items
          .map(
            (item) => `<li class="rip-inv-checklist-item" data-ready="${item.ready ? '1' : '0'}" data-key="${escapeHtml(item.key)}">
              <span class="rip-inv-checklist-mark" aria-hidden="true">${item.ready ? '✓' : '·'}</span>
              <div class="rip-inv-checklist-copy">
                <span class="rip-inv-checklist-label">${escapeHtml(item.label)}</span>
                <p class="rip-inv-checklist-hint">${escapeHtml(item.hint)}</p>
              </div>
              ${
                item.actionHref && item.actionLabel
                  ? `<a class="rip-inv-checklist-action" href="${escapeHtml(item.actionHref)}" target="_blank" rel="noreferrer">${escapeHtml(item.actionLabel)}</a>`
                  : ''
              }
            </li>`,
          )
          .join('')}
      </ul>`;

  const checklistHtml =
    !checklist.allReady || coach.visible
      ? `<div class="rip-inv-checklist" data-ready="${checklist.allReady ? '1' : '0'}" data-rip-checklist>
      <div class="rip-inv-checklist-head">
        <p class="rip-inv-checklist-title">${escapeHtml(checklist.title)}</p>
        <p class="rip-inv-checklist-summary">${escapeHtml(checklist.summaryLine)}</p>
      </div>
      ${checklistItemsHtml}
    </div>`
      : '';

  const steamWarnHtml = steamEnrichmentDegraded
    ? `<p class="rip-inv-steam-warn" data-rip-steam-enrich-warn role="status">${escapeHtml(
        t('inventory.steamEnrichmentDegraded'),
      )}</p>`
    : '';

  const reloadHtml = extensionContextInvalidated
    ? `<p class="rip-inv-reload" role="alert">Расширение обновилось — обновите вкладку Steam, иначе кнопки продажи не работают. <button type="button" data-rip-reload-tab>Обновить страницу</button></p>`
    : '';

  const holdFacts = mergeSteamFactsMaps(
    buildDomBaselineSteamFacts(document),
    steamFactsCache?.byAssetId,
  );
  const holdBanner = resolveTradeHoldBannerView({
    facts: holdFacts.values(),
    dismissed: isTradeHoldBannerDismissed(),
  });
  const holdHtml = holdBanner.visible
    ? `<div class="rip-inv-hold" role="status" data-rip-trade-hold>
      <p class="rip-inv-hold-title">${escapeHtml(holdBanner.title)}</p>
      <p class="rip-inv-hold-body">${escapeHtml(holdBanner.body)}</p>
      <div class="rip-inv-hold-actions">
        <button type="button" class="rip-inv-cta-secondary" data-rip-hold-dismiss>${escapeHtml(holdBanner.dismissLabel)}</button>
      </div>
    </div>`
    : '';

  const secondaryCtaHtml = view.secondaryCta
    ? `<a class="rip-inv-cta-secondary" href="${escapeHtml(view.secondaryCta.href)}" target="_blank" rel="noreferrer">${escapeHtml(view.secondaryCta.label)}</a>`
    : '';

  host.innerHTML = `
    ${coachHtml}
    ${trialHtml}
    <div class="rip-inv-bar" data-connection="${view.connection}">
      <div class="rip-inv-bar-top">
        <div class="rip-inv-identity">
          <span class="rip-inv-brand">${escapeHtml(view.title)}</span>
          <span class="rip-inv-status" data-connection="${view.connection}">${escapeHtml(view.statusLabel)}</span>
        </div>
        <span class="rip-inv-meta">на экране · ${view.itemHolderCount}</span>
      </div>
      <p class="rip-inv-body">${escapeHtml(view.body)}</p>
      <div class="rip-inv-bar-actions">
        ${draftChip}
        ${bulkToggle}
        ${browserAssistBtn}
        <a class="rip-inv-cta" href="${escapeHtml(view.ctaHref)}" target="_blank" rel="noreferrer">${escapeHtml(view.ctaLabel)}</a>
        ${secondaryCtaHtml}
      </div>
      ${reloadHtml}
      ${steamWarnHtml}
    </div>
    ${holdHtml}
    ${checklistHtml}
  `;

  host
    .querySelector('[data-rip-reload-tab]')
    ?.addEventListener('click', () => {
      window.location.reload();
    });

  host
    .querySelector('[data-rip-draft-dismiss]')
    ?.addEventListener('click', () => {
      sellDraftRestoreChip = null;
      scheduleHostRender();
    });

  host
    .querySelector('[data-rip-browser-assist]')
    ?.addEventListener('click', () => {
      void runBrowserAssistSync();
    });

  host
    .querySelector('[data-rip-bulk-toggle]')
    ?.addEventListener('click', () => {
      bulkMode = !bulkMode;
      if (!bulkMode) {
        bulkSelected = new Set();
      }
      persistSellDraft();
      scheduleHostRender();
      // Force immediate re-paint so checkboxes appear on cards.
      scheduleEnrichment(false);
    });

  host
    .querySelector('[data-rip-coach-dismiss]')
    ?.addEventListener('click', () => {
      void persistCoachDismiss();
    });

  host
    .querySelector('[data-rip-trial-dismiss]')
    ?.addEventListener('click', () => {
      void persistDismissTrialListHint()
        .then(() => scheduleHostRender())
        .catch(() => undefined);
    });

  host
    .querySelector('[data-rip-hold-dismiss]')
    ?.addEventListener('click', () => {
      dismissTradeHoldBanner();
      scheduleHostRender();
    });

  renderBulkBar();
}

function removeBulkBar(): void {
  document.getElementById(BULK_BAR_ID)?.remove();
}

function collectBulkItemsFromSelection(): BulkSellItem[] {
  const items: BulkSellItem[] = [];
  for (const assetId of bulkSelected) {
    const steam = steamFactsCache?.byAssetId.get(assetId);
    if (!steam) {
      continue;
    }
    const platform = platformFactsCache?.byAssetId[assetId] ?? null;
    const item = buildBulkSellItem({ steam, platform });
    if (item) {
      items.push(item);
    }
  }
  return items;
}

function renderBulkBar(): void {
  if (!bulkMode || !lastConnected) {
    removeBulkBar();
    return;
  }
  ensureStyles();
  const plan = planBulkSellOperations(collectBulkItemsFromSelection());
  const count = plan.selectedCount;
  const submitError = validateBulkSelectionForSubmit(plan.plannedCount);
  const namePreview = formatBulkListingPreview(
    plan.operations.flatMap((op) => op.items.map((entry) => entry.marketHashName)),
    2,
  );
  const namesHint =
    namePreview.lines.length > 0
      ? namePreview.moreCount > 0
        ? `${namePreview.lines.join(' · ')} · +${namePreview.moreCount}`
        : namePreview.lines.join(' · ')
      : plan.summaryLine || plan.modeLabel;
  let bar = document.getElementById(BULK_BAR_ID);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = BULK_BAR_ID;
    document.documentElement.appendChild(bar);
  }
  bar.innerHTML = `
    <span class="rip-bulk-count">Выбрано: ${count}</span>
    <span class="rip-bulk-meta" title="${escapeHtml(namesHint)}">${escapeHtml(namesHint)}</span>
    <button type="button" class="rip-bulk-btn rip-bulk-btn--primary" data-rip-bulk-sell ${submitError ? 'disabled' : ''}>Выставить</button>
    <button type="button" class="rip-bulk-btn rip-bulk-btn--secondary" data-rip-bulk-clear>Очистить</button>
    <button type="button" class="rip-bulk-btn rip-bulk-btn--secondary" data-rip-bulk-exit>Выйти</button>
  `;
  bar
    .querySelector('[data-rip-bulk-clear]')
    ?.addEventListener('click', () => {
      bulkSelected = new Set();
      persistSellDraft();
      scheduleEnrichment(false);
    });
  bar.querySelector('[data-rip-bulk-exit]')?.addEventListener('click', () => {
    bulkMode = false;
    bulkSelected = new Set();
    persistSellDraft();
    scheduleHostRender();
  });
  bar.querySelector('[data-rip-bulk-sell]')?.addEventListener('click', () => {
    if (submitError) {
      showSellToast({ message: submitError });
      return;
    }
    openBulkSellPanel();
  });
}

function openBulkSellPanel(): void {
  const items = collectBulkItemsFromSelection();
  const plan = planBulkSellOperations(items);
  const submitError = validateBulkSelectionForSubmit(plan.plannedCount);
  if (submitError) {
    showSellToast({ message: submitError });
    return;
  }

  ensureStyles();
  closeSellPanel();

  const names = [
    ...new Set(
      plan.operations.flatMap((op) => op.items.map((entry) => entry.marketHashName)),
    ),
  ];
  const namePreview = formatBulkListingPreview(names, 8);
  const primaryName = names[0] ?? 'предметы';
  const hint =
    (primaryName && priceHintsCache?.byName[primaryName]) || null;
  const defaultMinor = resolveDefaultListPriceMinor(hint);
  const defaultValue =
    defaultMinor != null ? formatUsdInputFromMinor(defaultMinor) : '';
  const namesListHtml =
    namePreview.lines.length > 0
      ? `<ul class="rip-sell-name-list" data-testid="rip-bulk-name-list">
          ${namePreview.lines
            .map((name) => `<li>${escapeHtml(name)}</li>`)
            .join('')}
        </ul>
        ${
          namePreview.moreCount > 0
            ? `<p class="rip-sell-name-more">и ещё ${namePreview.moreCount}</p>`
            : ''
        }`
      : '';

  const panel = document.createElement('div');
  panel.id = SELL_PANEL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.innerHTML = `
    <div class="rip-sell-card">
      <p class="rip-sell-eyebrow">R.I.P Market</p>
      <p class="rip-sell-title">Множественная продажа</p>
      <p class="rip-sell-item">${escapeHtml(String(plan.plannedCount))} шт · ${escapeHtml(plan.modeLabel)}</p>
      <p class="rip-sell-preview">${escapeHtml(plan.summaryLine)}</p>
      ${namesListHtml}
      <label class="rip-sell-label" for="rip-sell-price">Цена за штуку ($)</label>
      <input id="rip-sell-price" class="rip-sell-input" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(defaultValue)}" placeholder="0.00" />
      <p class="rip-sell-preview" data-rip-sell-commission></p>
      <p class="rip-sell-error"></p>
      <div class="rip-sell-actions">
        <button type="button" class="rip-sell-btn rip-sell-btn--primary" data-rip-bulk-confirm>Выставить всё</button>
        <button type="button" class="rip-sell-btn rip-sell-btn--secondary" data-rip-sell-close>Отмена</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(panel);
  updateSellPreview(panel);

  panel.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target === panel || target?.closest?.('[data-rip-sell-close]')) {
      closeSellPanel();
    }
  });
  panel
    .querySelector('.rip-sell-input')
    ?.addEventListener('input', () => updateSellPreview(panel));
  panel
    .querySelector('[data-rip-bulk-confirm]')
    ?.addEventListener('click', () => {
      void submitBulkSellFromPanel(panel, plan.operations);
    });
  panel.querySelector<HTMLInputElement>('.rip-sell-input')?.focus();
}

async function submitBulkSellFromPanel(
  panel: HTMLElement,
  operations: ReturnType<typeof planBulkSellOperations>['operations'],
): Promise<void> {
  const input = panel.querySelector<HTMLInputElement>('.rip-sell-input');
  const errorEl = panel.querySelector<HTMLElement>('.rip-sell-error');
  const confirmBtn = panel.querySelector<HTMLButtonElement>(
    '[data-rip-bulk-confirm]',
  );
  const priceMinor = parseUsdInputToMinor(input?.value ?? '');
  const priceError = validateCreateLotPriceMinor(priceMinor);
  if (priceError || priceMinor == null) {
    if (errorEl) {
      errorEl.textContent = priceError ?? 'Введите цену';
    }
    return;
  }

  const total = operations.reduce((sum, op) => sum + op.items.length, 0);
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Выставляем…';
  }
  if (errorEl) {
    errorEl.textContent = '';
  }
  const progressEl = panel.querySelector<HTMLElement>('[data-rip-sell-commission]');
  if (progressEl) {
    progressEl.textContent = buildBulkProgress({
      total,
      done: 0,
      created: 0,
      failed: 0,
    }).label;
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: TRADE_VERIFICATION_RUNTIME.CREATE_INVENTORY_LOTS_BATCH,
      priceMinor,
      operations,
    })) as {
      ok?: boolean;
      created?: Array<{ steamAssetId: string; lotId: string; lotUrl: string }>;
      failed?: Array<{ steamAssetId: string; error: string }>;
      listingsUrl?: string;
      error?: string;
    };

    const created = response?.created ?? [];
    const failed = response?.failed ?? [];
    if (created.length > 0) {
      void recordTwoMinuteFirstList().catch(() => undefined);
    }
    const progress = buildBulkProgress({
      total,
      done: created.length + failed.length,
      created: created.length,
      failed: failed.length,
    });

    const card = panel.querySelector('.rip-sell-card');
    if (card) {
      const failHint =
        failed.length > 0
          ? `<p class="rip-sell-error">${escapeHtml(
              failed[0]?.error ?? 'Часть предметов не выставилась',
            )}${failed.length > 1 ? ` (+${failed.length - 1})` : ''}</p>`
          : '';
      card.innerHTML = `
        <p class="rip-sell-title">${created.length > 0 ? 'Готово' : 'Не выставлено'}</p>
        <p class="rip-sell-success">${escapeHtml(progress.label)}</p>
        ${failHint}
        <div class="rip-sell-actions">
          ${
            response?.listingsUrl
              ? `<a class="rip-sell-btn rip-sell-btn--primary" href="${escapeHtml(response.listingsUrl)}" target="_blank" rel="noreferrer">Мои объявления</a>`
              : ''
          }
          ${
            failed.length > 0
              ? `<button type="button" class="rip-sell-btn rip-sell-btn--secondary" data-rip-bulk-retry>Повторить ошибки</button>`
              : ''
          }
          <button type="button" class="rip-sell-btn rip-sell-btn--secondary" data-rip-sell-close>Закрыть</button>
        </div>
      `;
      card
        .querySelector('[data-rip-sell-close]')
        ?.addEventListener('click', () => closeSellPanel());
      card
        .querySelector('[data-rip-bulk-retry]')
        ?.addEventListener('click', () => {
          const failedIds = new Set(failed.map((entry) => entry.steamAssetId));
          bulkSelected = new Set(
            [...bulkSelected].filter((id) => failedIds.has(id)),
          );
          closeSellPanel();
          openBulkSellPanel();
          scheduleEnrichment(false);
        });
    }

    showSellToast({
      message: progress.label,
      listingsUrl: response?.listingsUrl,
      lotUrl: created[0]?.lotUrl,
    });

    for (const entry of created) {
      bulkSelected.delete(entry.steamAssetId);
    }
    platformFactsCache = null;
    scheduleEnrichment(false);
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = humanizeListingApiError({
        message:
          error instanceof Error ? error.message : 'Не удалось выставить лоты',
      });
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Выставить всё';
    }
  }
}

function scheduleHostRender(): void {
  if (renderTimer !== null) {
    window.clearTimeout(renderTimer);
  }
  renderTimer = window.setTimeout(() => {
    renderTimer = null;
    void renderHostBar();
    scheduleEnrichment();
  }, 120);
}

function scheduleEnrichment(forceSteam = false): void {
  if (enrichTimer !== null) {
    window.clearTimeout(enrichTimer);
  }
  enrichTimer = window.setTimeout(() => {
    enrichTimer = null;
    void enrichItemCards(forceSteam);
  }, 180);
}

function watchInventoryDom(): void {
  const root =
    document.querySelector('#inventories') ??
    document.querySelector('#mainContents') ??
    document.body;
  const observer = new MutationObserver((mutations) => {
    const onlyOverlay =
      mutations.length > 0 &&
      mutations.every((mutation) => {
        const nodes = [
          ...Array.from(mutation.addedNodes),
          ...Array.from(mutation.removedNodes),
        ];
        return (
          nodes.length > 0 &&
          nodes.every(
            (node) =>
              node instanceof Element &&
              (node.classList?.contains(OVERLAY_CLASS) ||
                node.id === SELL_PANEL_ID ||
                node.id === TOAST_ID ||
                node.id === BULK_BAR_ID ||
                node.id === SELECTED_SELL_RAIL_ID ||
                node.closest?.(`.${OVERLAY_CLASS}`) ||
                node.closest?.(`#${SELL_PANEL_ID}`) ||
                node.closest?.(`#${TOAST_ID}`) ||
                node.closest?.(`#${BULK_BAR_ID}`) ||
                node.closest?.(`#${SELECTED_SELL_RAIL_ID}`)),
          )
        );
      });
    if (onlyOverlay) {
      return;
    }
    scheduleHostRender();
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'id'],
  });
}

function watchNavigation(): void {
  window.addEventListener('hashchange', () => {
    scheduleHostRender();
  });
  window.addEventListener('popstate', () => {
    scheduleHostRender();
  });

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element | null;
      const selectBox = target?.closest?.(
        '.rip-item-select[data-rip-bulk-asset]',
      ) as HTMLInputElement | null;
      if (selectBox) {
        event.stopPropagation();
        const assetId = selectBox.getAttribute('data-rip-bulk-asset')?.trim();
        if (assetId) {
          bulkSelected = toggleBulkSelection(
            bulkSelected,
            assetId,
            selectBox.checked,
          );
          persistSellDraft();
          renderBulkBar();
          const holder = selectBox.closest('.itemHolder');
          holder?.setAttribute(
            'data-rip-bulk-selected',
            selectBox.checked ? '1' : '0',
          );
        }
        return;
      }
      const sellBtn = target?.closest?.(
        '.rip-item-sell[data-rip-sell-asset], .rip-selected-sell[data-rip-sell-asset]',
      ) as HTMLElement | null;
      if (sellBtn) {
        event.preventDefault();
        event.stopPropagation();
        void openSellFromButton(sellBtn);
        return;
      }

      const clickedItem = target?.closest?.(
        `${CS2_INVENTORY_ITEM_SELECTOR}, .itemHolder`,
      ) as HTMLElement | null;
      if (clickedItem) {
        const itemEl = clickedItem.matches?.(CS2_INVENTORY_ITEM_SELECTOR)
          ? clickedItem
          : clickedItem.querySelector<HTMLElement>(CS2_INVENTORY_ITEM_SELECTOR);
        const clickedAsset = parseAssetIdFromItemElementId(itemEl?.id);
        if (clickedAsset) {
          lastClickedAssetId = clickedAsset;
          window.setTimeout(() => {
            syncSelectedSellRail({
              steamFacts:
                steamFactsCache?.byAssetId ??
                new Map<string, InventoryItemSteamFacts>(),
              platformFacts: platformFactsCache?.byAssetId ?? {},
              priceHints: priceHintsCache?.byName ?? {},
              connected: lastConnected,
            });
          }, 50);
        }
      }

      if (
        target?.closest?.(
          '.games_list_tab, #inventory_applogo, a[href*="inventory"], .inventory_page_right, .inventory_page_left',
        )
      ) {
        scheduleHostRender();
        window.setTimeout(() => scheduleEnrichment(false), 400);
      }
    },
    true,
  );
}

async function openSellFromButton(button: HTMLElement): Promise<void> {
  const assetId = button.getAttribute('data-rip-sell-asset')?.trim();
  if (!assetId) {
    return;
  }
  const overlay = button.closest(`.${OVERLAY_CLASS}`) as HTMLElement | null;
  const session = await getSessionState();
  const connected = Boolean(session?.accessToken && session.apiBaseUrl);
  const platform = platformFactsCache?.byAssetId[assetId] ?? null;
  const steam = steamFactsCache?.byAssetId.get(assetId);
  const action = resolveInventorySellAction({
    connected,
    siteSafeMode: lastSiteSafeMode,
    steam: steam ?? {
      tradable: true,
      marketable: true,
      tradeLockUntil: null,
    },
    platform,
  });

  const defaultAttr = overlay?.getAttribute('data-rip-default-price-minor');
  const defaultPriceMinor = defaultAttr ? Number(defaultAttr) : null;
  const marketHashName =
    overlay?.getAttribute('data-rip-market-hash-name')?.trim() ||
    steam?.marketHashName?.trim() ||
    platform?.marketHashName?.trim() ||
    `Asset ${assetId}`;
  const priceHint =
    (marketHashName && priceHintsCache?.byName[marketHashName]) || null;
  const sellUrl = siteSellInventoryUrl(session?.apiBaseUrl);
  const accountUrl = siteAccountUrl(session?.apiBaseUrl);

  if (action.kind === 'manage') {
    const manage = resolveManageListingAction({ connected, platform });
    openManagePanel({
      assetId,
      marketHashName,
      lotId:
        manage.lotId ||
        overlay?.getAttribute('data-rip-lot-id')?.trim() ||
        action.lotId ||
        '',
      lotUrl: manage.lotUrl || action.lotUrl,
      listedPriceMinor:
        manage.listedPriceMinor ??
        (overlay?.getAttribute('data-rip-listed-price-minor')
          ? Number(overlay.getAttribute('data-rip-listed-price-minor'))
          : null),
      sellUrl,
    });
    return;
  }

  openSellPanel({
    assetId,
    marketHashName,
    iconUrl: readSteamItemIconUrl(
      document,
      assetId,
      queryCs2InventoryItemByAssetId,
    ),
    inventoryAssetId:
      overlay?.getAttribute('data-rip-inventory-asset-id')?.trim() ||
      platform?.inventoryAssetId ||
      null,
    defaultPriceMinor:
      defaultPriceMinor != null && Number.isFinite(defaultPriceMinor)
        ? defaultPriceMinor
        : null,
    priceHint,
    action,
    accountUrl,
    sellUrl,
  });
}

type ManagePanelContext = {
  assetId: string;
  marketHashName: string;
  lotId: string;
  lotUrl: string | null;
  listedPriceMinor: number | null;
  sellUrl: string;
};

function openManagePanel(ctx: ManagePanelContext): void {
  ensureStyles();
  closeSellPanel();

  if (!ctx.lotId) {
    showSellToast({
      message: 'Лот не найден. Откройте продажи на сайте.',
      listingsUrl: ctx.sellUrl,
    });
    return;
  }

  const priceValue = formatListedPriceInput(ctx.listedPriceMinor);
  const panel = document.createElement('div');
  panel.id = SELL_PANEL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Управление лотом');
  panel.innerHTML = `
    <div class="rip-sell-card">
      <p class="rip-sell-title">Управление лотом</p>
      <p class="rip-sell-item">${escapeHtml(ctx.marketHashName)}</p>
      <p class="rip-sell-preview">${escapeHtml(formatManageCurrentPriceLine(ctx.listedPriceMinor))}</p>
      <label class="rip-sell-label" for="rip-sell-price">Новая цена ($)</label>
      <input id="rip-sell-price" class="rip-sell-input" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(priceValue)}" placeholder="0.00" />
      <p class="rip-sell-preview" data-rip-sell-commission></p>
      <p class="rip-sell-error"></p>
      <div class="rip-sell-actions">
        <button type="button" class="rip-sell-btn rip-sell-btn--primary" data-rip-manage-save>Сохранить цену</button>
        <button type="button" class="rip-sell-btn rip-sell-btn--secondary" data-rip-manage-cancel>Снять с продажи</button>
        ${
          ctx.lotUrl
            ? `<a class="rip-sell-btn rip-sell-btn--secondary" href="${escapeHtml(ctx.lotUrl)}" target="_blank" rel="noreferrer">Открыть лот</a>`
            : ''
        }
        <button type="button" class="rip-sell-btn rip-sell-btn--secondary" data-rip-sell-close>Закрыть</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(panel);
  updateSellPreview(panel);

  panel.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target === panel || target?.closest?.('[data-rip-sell-close]')) {
      closeSellPanel();
    }
  });
  panel
    .querySelector('.rip-sell-input')
    ?.addEventListener('input', () => updateSellPreview(panel));
  panel
    .querySelector('[data-rip-manage-save]')
    ?.addEventListener('click', () => {
      void submitManagePrice(panel, ctx);
    });
  panel
    .querySelector('[data-rip-manage-cancel]')
    ?.addEventListener('click', () => {
      void submitManageCancel(panel, ctx);
    });
  panel.querySelector<HTMLInputElement>('.rip-sell-input')?.focus();
}

async function submitManagePrice(
  panel: HTMLElement,
  ctx: ManagePanelContext,
): Promise<void> {
  const input = panel.querySelector<HTMLInputElement>('.rip-sell-input');
  const errorEl = panel.querySelector<HTMLElement>('.rip-sell-error');
  const saveBtn = panel.querySelector<HTMLButtonElement>('[data-rip-manage-save]');
  const parsed = buildManagePricePreview(input?.value ?? '');
  if (parsed.error || parsed.priceMinor == null) {
    if (errorEl) {
      errorEl.textContent = parsed.error ?? 'Введите цену';
    }
    return;
  }
  if (!hasPriceChanged(ctx.listedPriceMinor, parsed.priceMinor)) {
    if (errorEl) {
      errorEl.textContent = 'Цена не изменилась';
    }
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохраняем…';
  }
  if (errorEl) {
    errorEl.textContent = '';
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: TRADE_VERIFICATION_RUNTIME.UPDATE_INVENTORY_LOT_PRICE,
      lotId: ctx.lotId,
      priceMinor: parsed.priceMinor,
    })) as {
      ok?: boolean;
      lotUrl?: string;
      listingsUrl?: string;
      priceMinor?: string;
      error?: string;
    };

    if (!response?.ok) {
      if (errorEl) {
        errorEl.textContent = response?.error ?? 'Не удалось обновить цену';
      }
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить цену';
      }
      return;
    }

    showSellToast({
      message: 'Цена обновлена',
      lotUrl: response.lotUrl ?? ctx.lotUrl,
      listingsUrl: response.listingsUrl,
    });
    closeSellPanel();
    platformFactsCache = null;
    scheduleEnrichment(false);
  } catch (error) {
    if (errorEl) {
      errorEl.textContent =
        error instanceof Error ? error.message : 'Не удалось обновить цену';
    }
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Сохранить цену';
    }
  }
}

async function submitManageCancel(
  panel: HTMLElement,
  ctx: ManagePanelContext,
): Promise<void> {
  const errorEl = panel.querySelector<HTMLElement>('.rip-sell-error');
  const cancelBtn = panel.querySelector<HTMLButtonElement>(
    '[data-rip-manage-cancel]',
  );
  const confirmed = window.confirm(
    `Снять «${ctx.marketHashName}» с продажи на R.I.P?`,
  );
  if (!confirmed) {
    return;
  }

  if (cancelBtn) {
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Снимаем…';
  }
  if (errorEl) {
    errorEl.textContent = '';
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: TRADE_VERIFICATION_RUNTIME.CANCEL_INVENTORY_LOT,
      lotId: ctx.lotId,
    })) as {
      ok?: boolean;
      listingsUrl?: string;
      error?: string;
    };

    if (!response?.ok) {
      if (errorEl) {
        errorEl.textContent =
          response?.error ?? 'Не удалось снять с продажи';
      }
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Снять с продажи';
      }
      return;
    }

    showSellToast({
      message: 'Лот снят с продажи',
      listingsUrl: response.listingsUrl,
    });
    closeSellPanel();
    platformFactsCache = null;
    scheduleEnrichment(false);
  } catch (error) {
    if (errorEl) {
      errorEl.textContent =
        error instanceof Error
          ? error.message
          : 'Не удалось снять с продажи';
    }
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Снять с продажи';
    }
  }
}

async function mount(): Promise<void> {
  if (!isSteamInventoryPath(window.location.pathname) || mounted) {
    return;
  }
  // I5: remote kill for inventory overlays (unset storage = on).
  if (!(await isExtensionInventoryLayerEnabled())) {
    return;
  }
  mounted = true;
  await renderHostBar();
  await enrichItemCards(true);
  watchInventoryDom();
  watchNavigation();
  window.setInterval(() => {
    void renderHostBar();
    void enrichItemCards(false);
  }, 12_000);
}

void mount();
