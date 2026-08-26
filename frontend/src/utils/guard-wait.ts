/**
 * Formats elapsed Guard wait as m:ss (or h:mm:ss if ≥ 1 hour).
 */
export function formatGuardWaitElapsed(
  sinceIso: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!sinceIso) {
    return null;
  }
  const since = Date.parse(sinceIso);
  if (!Number.isFinite(since) || since > nowMs) {
    return null;
  }
  const totalSec = Math.floor((nowMs - since) / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
