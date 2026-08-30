import { describe, expect, it } from 'vitest';
import {
  parsePartnerSteamIdFromDocument,
  parsePartnerSteamIdFromTradeOfferUrl,
} from './parse-trade-partner-steamid.js';

describe('parse-trade-partner-steamid', () => {
  it('converts partner account id from tradeoffer/new URL', () => {
    expect(
      parsePartnerSteamIdFromTradeOfferUrl(
        'https://steamcommunity.com/tradeoffer/new/?partner=39734272&token=abc',
      ),
    ).toBe('76561198000000000');
  });

  it('reads SteamID64 from partner profile link', () => {
    document.body.innerHTML = `
      <div class="trade_partner_header">
        <a href="https://steamcommunity.com/profiles/76561198123456789">Nick</a>
      </div>
    `;
    expect(parsePartnerSteamIdFromDocument(document, 'https://steamcommunity.com/tradeoffer/123/')).toBe(
      '76561198123456789',
    );
  });
});
