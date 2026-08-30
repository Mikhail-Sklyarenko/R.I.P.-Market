/**
 * Extension context safety for content scripts.
 * After reload/update, orphaned scripts throw "Extension context invalidated"
 * on any chrome.* call. Product rule: degrade loudly (reload banner), never crash paint.
 */

export function isExtensionContextValid(): boolean {
  try {
    return Boolean(
      typeof chrome !== 'undefined' &&
        chrome.runtime &&
        typeof chrome.runtime.id === 'string' &&
        chrome.runtime.id.length > 0,
    );
  } catch {
    return false;
  }
}

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);
  return /Extension context invalidated/i.test(message);
}

/**
 * Run an async chrome-backed call. Returns fallback when the extension was
 * reloaded under this tab (or the call throws for any reason).
 */
export async function withExtensionContext<T>(
  run: () => Promise<T>,
  fallback: T,
): Promise<{ ok: true; value: T } | { ok: false; invalidated: boolean; value: T }> {
  if (!isExtensionContextValid()) {
    return { ok: false, invalidated: true, value: fallback };
  }
  try {
    const value = await run();
    return { ok: true, value };
  } catch (error) {
    const invalidated = isExtensionContextInvalidatedError(error);
    if (invalidated || !isExtensionContextValid()) {
      return { ok: false, invalidated: true, value: fallback };
    }
    return { ok: false, invalidated: false, value: fallback };
  }
}
