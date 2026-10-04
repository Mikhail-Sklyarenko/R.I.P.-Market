type Poll = {
  strategy: string | null;
  offerStatus: string | null;
  outcome: string;
};
/** Newest first. Client PAGE_OBSERVED rows must never reset a server retry budget. */
export function deliveryStreaks(rows: Poll[]) {
  const server = rows.filter(
    (r) =>
      r.strategy?.startsWith('OFFER_POLL+') ||
      r.strategy?.startsWith('INVENTORY_DELTA:'),
  );
  const count = (predicate: (p: Poll) => boolean) => {
    let n = 0;
    for (const row of server) {
      if (!predicate(row)) break;
      n++;
    }
    return n;
  };
  return {
    offerUnknownStreak: count(
      (p) => p.offerStatus === 'unknown' || p.offerStatus === null,
    ),
    inventoryUnknownStreak: count(
      (p) => p.strategy?.endsWith(':unknown') === true,
    ),
    acceptedPendingStreak: count(
      (p) => p.offerStatus === 'accepted' && p.outcome !== 'CONFIRMED',
    ),
  };
}
