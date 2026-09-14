import { mergeSteamOfferStatus } from './merge-steam-offer-status';

describe('mergeSteamOfferStatus', () => {
  it('does not trust page observations as delivery proof', () => {
    expect(mergeSteamOfferStatus('pending', 'accepted')).toBe('pending');
    expect(mergeSteamOfferStatus('unknown', 'accepted')).toBe('unknown');
    expect(mergeSteamOfferStatus(null, 'accepted')).toBeNull();
  });

  it('keeps API terminal decline/expire over page accepted', () => {
    expect(mergeSteamOfferStatus('declined', 'accepted')).toBe('declined');
    expect(mergeSteamOfferStatus('expired', 'accepted')).toBe('expired');
  });

  it('passes through API when no page observation', () => {
    expect(mergeSteamOfferStatus('needs_confirmation', null)).toBe(
      'needs_confirmation',
    );
  });
});
