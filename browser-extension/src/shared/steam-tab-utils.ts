export interface NavigateTabOptions {
  active?: boolean;
}

export async function waitForTabLoad(tabId: number, timeoutMs = 20_000): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.status === 'complete') {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return;
  }

  await new Promise<void>((resolve) => {
    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function navigateTab(
  tabId: number,
  url: string,
  options: NavigateTabOptions = {},
): Promise<void> {
  await chrome.tabs.update(tabId, { url, active: options.active ?? false });
  await waitForTabLoad(tabId);
}

function tradeUrlKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const partner = parsed.searchParams.get('partner');
    const token = parsed.searchParams.get('token');
    if (!partner || !token) {
      return null;
    }
    return `${partner}:${token}`;
  } catch {
    return null;
  }
}

export async function waitForTabUrl(
  tabId: number,
  expectedUrl: string,
  timeoutMs = 25_000,
): Promise<boolean> {
  const expectedKey = tradeUrlKey(expectedUrl);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url && tab.status === 'complete') {
      if (expectedKey) {
        if (tradeUrlKey(tab.url) === expectedKey) {
          return true;
        }
      } else if (tab.url.startsWith(expectedUrl.split('?')[0] ?? expectedUrl)) {
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}
