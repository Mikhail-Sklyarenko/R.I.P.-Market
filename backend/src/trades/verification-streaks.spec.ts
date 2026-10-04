import { deliveryStreaks } from './verification-streaks';

const row = (offerStatus: string, inventory = 'pending') => ({
  offerStatus,
  strategy: `OFFER_POLL+INVENTORY_DELTA:${inventory}`,
  outcome: 'WAIT',
});
it('derives only consecutive unknown responses, independent of lifetime count', () => {
  expect(
    deliveryStreaks([
      row('unknown'),
      ...Array.from({ length: 25 }, () => row('accepted')),
    ]).offerUnknownStreak,
  ).toBe(1);
  expect(
    deliveryStreaks(Array.from({ length: 20 }, () => row('unknown')))
      .offerUnknownStreak,
  ).toBe(20);
});
it('keeps offer, inventory and accepted-pending budgets separate across restart', () => {
  const events = [
    row('accepted', 'unknown'),
    row('accepted'),
    row('pending', 'unknown'),
  ];
  expect(deliveryStreaks(JSON.parse(JSON.stringify(events)))).toEqual({
    offerUnknownStreak: 0,
    inventoryUnknownStreak: 1,
    acceptedPendingStreak: 2,
  });
});
it('client observations and settlement events cannot reset or consume delivery streaks', () => {
  expect(
    deliveryStreaks([
      row('unknown'),
      { ...row('accepted'), strategy: 'PAGE_OBSERVED' },
      { ...row('unknown'), strategy: 'SETTLEMENT_PROTECTION_RECHECK' },
      row('unknown'),
    ]).offerUnknownStreak,
  ).toBe(2);
});
