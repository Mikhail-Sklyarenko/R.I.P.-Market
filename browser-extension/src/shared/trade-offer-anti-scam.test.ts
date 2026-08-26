import { describe, expect, it } from 'vitest';
import {
  antiScamHasBlocking,
  antiScamStickyShort,
  detectSteamEscrowHint,
  evaluateAntiScamRules,
  parseOfferSlotSnapshot,
} from './trade-offer-anti-scam.js';

describe('trade-offer-anti-scam', () => {
  it('flags unlinked offers as blocking', () => {
    const warnings = evaluateAntiScamRules({
      hasLinkedActiveOrder: false,
      role: null,
      slots: null,
      includeStickyHint: false,
    });
    expect(warnings.some((w) => w.id === 'offer_not_linked')).toBe(true);
    expect(antiScamHasBlocking(warnings)).toBe(true);
  });

  it('blocks when buyer is asked for their items', () => {
    const warnings = evaluateAntiScamRules({
      hasLinkedActiveOrder: true,
      role: 'buyer',
      slots: {
        yourItemCount: 1,
        theirItemCount: 1,
        steamEscrowHint: null,
      },
      includeStickyHint: false,
    });
    expect(warnings.find((w) => w.id === 'requests_your_items')?.severity).toBe(
      'block',
    );
  });

  it('warns on extra items from partner', () => {
    const warnings = evaluateAntiScamRules({
      hasLinkedActiveOrder: true,
      role: 'buyer',
      slots: {
        yourItemCount: 0,
        theirItemCount: 3,
        steamEscrowHint: null,
      },
      includeStickyHint: false,
    });
    expect(warnings.find((w) => w.id === 'extra_items_from_them')?.severity).toBe(
      'warn',
    );
  });

  it('warns on steam trade hold hint', () => {
    const warnings = evaluateAntiScamRules({
      hasLinkedActiveOrder: true,
      role: 'buyer',
      slots: {
        yourItemCount: 0,
        theirItemCount: 1,
        steamEscrowHint: 'Items will be held by Steam',
      },
      includeStickyHint: false,
    });
    expect(warnings.some((w) => w.id === 'steam_trade_hold')).toBe(true);
  });

  it('always can include sticky chat hint', () => {
    const warnings = evaluateAntiScamRules({
      hasLinkedActiveOrder: true,
      role: 'buyer',
      slots: { yourItemCount: 0, theirItemCount: 1, steamEscrowHint: null },
    });
    expect(warnings.some((w) => w.id === 'never_accept_from_chat')).toBe(true);
    expect(antiScamStickyShort()).toMatch(/чата/i);
  });

  it('detects steam escrow phrases', () => {
    expect(
      detectSteamEscrowHint(
        'These items will be held by Steam and released in 7 days.',
      ),
    ).toMatch(/held by Steam/i);
    expect(detectSteamEscrowHint('Clean offer page')).toBeNull();
  });

  it('parses slot counts from offer page DOM', () => {
    document.body.innerHTML = `
      <div id="trade_yours">
        <div class="item" data-assetid="111"></div>
      </div>
      <div id="trade_theirs">
        <div class="item" data-assetid="222"></div>
        <div class="item" data-assetid="333"></div>
      </div>
      <p>Items will be held by Steam for 8 days.</p>
    `;
    const snapshot = parseOfferSlotSnapshot(document);
    expect(snapshot.yourItemCount).toBe(1);
    expect(snapshot.theirItemCount).toBe(2);
    expect(snapshot.steamEscrowHint).toMatch(/held by Steam/i);
  });
});
