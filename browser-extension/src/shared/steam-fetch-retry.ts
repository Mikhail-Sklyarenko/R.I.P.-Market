const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_ATTEMPTS = 3;
const BASE_DELAY_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  fetchFn: () => Promise<Response>,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<Response> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? BASE_DELAY_MS;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchFn();
      if (response.ok || !RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }
      lastError = new Error(`Inventory HTTP ${response.status}`);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Inventory fetch failed');
    }

    if (attempt < attempts) {
      await delay(baseDelayMs * attempt);
    }
  }

  throw lastError ?? new Error('Inventory fetch failed');
}
