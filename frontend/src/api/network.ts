/** Network / transient HTTP helpers for resilient API calls. */

export function isRetryableNetworkError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return /Failed to fetch|NetworkError|Load failed|network request failed|ECONNRESET|ETIMEDOUT/i.test(
    error.message,
  );
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
