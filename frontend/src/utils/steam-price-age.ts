const DAY_MS = 24 * 60 * 60 * 1000;

/** Human-readable Steam price age for item page hints. */
export function formatSteamPriceAge(
  fetchedAt: string | null | undefined,
): string | null {
  if (!fetchedAt?.trim()) {
    return null;
  }
  const fetchedMs = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetchedMs)) {
    return null;
  }

  const ageMs = Date.now() - fetchedMs;
  if (ageMs < 0) {
    return null;
  }

  const days = Math.floor(ageMs / DAY_MS);
  if (days <= 0) {
    return 'сегодня';
  }
  if (days === 1) {
    return 'вчера';
  }
  if (days < 14) {
    return `${days} дн. назад`;
  }
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? '1 нед. назад' : `${weeks} нед. назад`;
}

export function isSteamPriceStale(
  fetchedAt: string | null | undefined,
  staleAfterDays = 14,
): boolean {
  if (!fetchedAt?.trim()) {
    return false;
  }
  const fetchedMs = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetchedMs)) {
    return false;
  }
  return Date.now() - fetchedMs > staleAfterDays * DAY_MS;
}
