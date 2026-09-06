import { mergeSteamOfferStatus } from './merge-steam-offer-status';

describe('mergeSteamOfferStatus', () => {
  it('prefers page accepted over pending/unknown', () => {
    expect(mergeSteamOfferStatus('pending', 'accepted')).toBe('accepted');
    expect(mergeSteamOfferStatus('unknown', 'accepted')).toBe('accepted');
    expect(mergeSteamOfferStatus(null, 'accepted')).toBe('accepted');
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
