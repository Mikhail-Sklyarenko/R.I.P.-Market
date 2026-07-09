import {
  clearSteamWebApiKey,
  getSteamWebApiKey,
  saveSteamWebApiKey,
} from '../shared/steam-web-api-settings.js';

const statusEl = document.getElementById('status');
const disconnectBtn = document.getElementById('disconnect') as HTMLButtonElement;
const openSiteBtn = document.getElementById('open-site') as HTMLButtonElement;
const apiKeyInput = document.getElementById('steam-api-key') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('save-api-key') as HTMLButtonElement;
const clearApiKeyBtn = document.getElementById('clear-api-key') as HTMLButtonElement;
const apiKeyStatusEl = document.getElementById('api-key-status');

type ExtensionStatus = {
  connected: boolean;
  expiresAt?: string;
};

async function fetchStatus(): Promise<ExtensionStatus> {
  return chrome.runtime.sendMessage({ type: 'RIP_MARKET_STATUS' }) as Promise<ExtensionStatus>;
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
  } else {
    statusEl.className = 'status off';
    statusEl.textContent = 'Не подключено';
    disconnectBtn.hidden = true;
  }

  const storedKey = await getSteamWebApiKey();
  if (apiKeyInput && document.activeElement !== apiKeyInput) {
    apiKeyInput.value = storedKey ?? '';
  }
  await renderApiKeyStatus();
}

openSiteBtn.addEventListener('click', () => {
  void chrome.tabs.create({ url: 'http://localhost:5173/account' });
});

disconnectBtn.addEventListener('click', () => {
  void chrome.runtime
    .sendMessage({ type: 'RIP_MARKET_DISCONNECT' })
    .then(() => render());
});

saveApiKeyBtn.addEventListener('click', () => {
  void saveSteamWebApiKey(apiKeyInput.value).then(() => render());
});

clearApiKeyBtn.addEventListener('click', () => {
  apiKeyInput.value = '';
  void clearSteamWebApiKey().then(() => render());
});

void render();
