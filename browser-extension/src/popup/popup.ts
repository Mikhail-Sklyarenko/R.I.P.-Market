import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  clearSteamWebApiKey,
  getSteamWebApiKey,
  saveSteamWebApiKey,
} from '../shared/steam-web-api-settings.js';
import { TRADE_VERIFICATION_RUNTIME } from '../shared/trade-verification-runtime.js';

const statusEl = document.getElementById('status');
const tradesEl = document.getElementById('trades');
const disconnectBtn = document.getElementById('disconnect') as HTMLButtonElement;
const openSiteBtn = document.getElementById('open-site') as HTMLButtonElement;
const refreshTradesBtn = document.getElementById('refresh-trades') as HTMLButtonElement;
const apiKeyInput = document.getElementById('steam-api-key') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('save-api-key') as HTMLButtonElement;
const clearApiKeyBtn = document.getElementById('clear-api-key') as HTMLButtonElement;
const apiKeyStatusEl = document.getElementById('api-key-status');

type ExtensionStatus = {
  connected: boolean;
  expiresAt?: string;
  apiBaseUrl?: string;
};

function formatMoneyMinor(amountMinor: string): string {
  const value = Number(amountMinor) / 100;
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : amountMinor;
}

function roleLabel(role: TradeVerificationResult['role']): string {
  return role === 'buyer' ? 'Покупатель' : 'Продавец';
}

function renderTrades(trades: TradeVerificationResult[]): void {
  if (!tradesEl) {
    return;
  }
  if (trades.length === 0) {
    tradesEl.hidden = true;
    tradesEl.innerHTML = '';
    return;
  }

  tradesEl.hidden = false;
  tradesEl.innerHTML = trades
    .slice(0, 3)
    .map((trade) => {
      const statusClass =
        trade.verificationStatus === 'verified'
          ? 'verified'
          : trade.verificationStatus === 'mismatch'
            ? 'mismatch'
            : '';
      return `
        <article class="trade-card ${statusClass}">
          <h2>${trade.item.marketHashName}</h2>
          <p class="meta">#${trade.orderShortId} · ${roleLabel(trade.role)} · ${formatMoneyMinor(trade.amountMinor)}</p>
          <p class="next"><strong>${trade.nextAction.title}</strong><br />${trade.nextAction.description}</p>
          <a class="btn secondary" href="${trade.siteUrl}" target="_blank" rel="noreferrer">Открыть заказ</a>
        </article>
      `;
    })
    .join('');
}

async function fetchStatus(): Promise<ExtensionStatus> {
  return chrome.runtime.sendMessage({ type: 'RIP_MARKET_STATUS' }) as Promise<ExtensionStatus>;
}

async function loadTrades(): Promise<TradeVerificationResult[]> {
  const refreshed = await chrome.runtime.sendMessage({
    type: TRADE_VERIFICATION_RUNTIME.REFRESH_ACTIVE_TRADES,
  }) as { ok: boolean; trades?: TradeVerificationResult[] };

  if (refreshed.ok && refreshed.trades) {
    return refreshed.trades;
  }

  const cached = await chrome.runtime.sendMessage({
    type: TRADE_VERIFICATION_RUNTIME.GET_ACTIVE_TRADES,
  }) as { ok: boolean; trades?: TradeVerificationResult[] };

  return cached.trades ?? [];
}

async function renderApiKeyStatus(): Promise<void> {
  if (!apiKeyStatusEl) {
    return;
  }
  const stored = await getSteamWebApiKey();
  apiKeyStatusEl.textContent = stored
    ? 'Ключ сохранён локально в расширении.'
    : 'Ключ не задан — используется только загрузка через Steam в браузере.';
}

async function render(): Promise<void> {
  const status = await fetchStatus();
  if (!statusEl) {
    return;
  }

  if (status.connected) {
    statusEl.className = 'status ok';
    statusEl.textContent = `Подключено до ${new Date(status.expiresAt ?? '').toLocaleTimeString()}`;
    disconnectBtn.hidden = false;
    refreshTradesBtn.hidden = false;
    const trades = await loadTrades();
    renderTrades(trades);
  } else {
    statusEl.className = 'status off';
    statusEl.textContent = 'Не подключено';
    disconnectBtn.hidden = true;
    refreshTradesBtn.hidden = true;
    renderTrades([]);
  }

  const storedKey = await getSteamWebApiKey();
  if (apiKeyInput && document.activeElement !== apiKeyInput) {
    apiKeyInput.value = storedKey ?? '';
  }
  await renderApiKeyStatus();
}

openSiteBtn.addEventListener('click', () => {
  void fetchStatus().then((status) => {
    const url = status.apiBaseUrl?.replace(/\/api\/v1$/, '') ?? 'http://localhost:5173/account';
    void chrome.tabs.create({ url });
  });
});

disconnectBtn.addEventListener('click', () => {
  void chrome.runtime
    .sendMessage({ type: 'RIP_MARKET_DISCONNECT' })
    .then(() => render());
});

refreshTradesBtn.addEventListener('click', () => {
  void render();
});

saveApiKeyBtn.addEventListener('click', () => {
  void saveSteamWebApiKey(apiKeyInput.value).then(() => render());
});

clearApiKeyBtn.addEventListener('click', () => {
  apiKeyInput.value = '';
  void clearSteamWebApiKey().then(() => render());
});

void render();
