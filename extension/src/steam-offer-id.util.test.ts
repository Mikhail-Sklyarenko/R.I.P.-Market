import { describe, expect, it } from 'vitest';
import { isValidSteamOfferId, normalizeSteamOfferId } from './steam-offer-id.util.js';

describe('steam-offer-id.util', () => {
  it('accepts numeric Steam offer ids', () => {
    expect(isValidSteamOfferId('99887766')).toBe(true);
  });

  it('rejects short and non-numeric ids', () => {
    expect(isValidSteamOfferId('12345')).toBe(false);
    expect(isValidSteamOfferId('pending-offer')).toBe(false);
    expect(isValidSteamOfferId('offer-draft-task-1')).toBe(false);
  });

  it('normalizes valid ids only', () => {
    expect(normalizeSteamOfferId(' 88776655 ')).toBe('88776655');
    expect(normalizeSteamOfferId('pending')).toBeNull();
  });
});
