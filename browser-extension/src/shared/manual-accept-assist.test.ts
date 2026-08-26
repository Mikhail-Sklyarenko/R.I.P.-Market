import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { TradeVerificationResult } from '@rip-market/extension-orchestrator';
import {
  buildManualAcceptListCta,
  buildOfferAcceptAssistView,
  canShowManualAcceptAssist,
  clickSteamAcceptControl,
  findSteamAcceptControls,
  pickSteamAcceptControl,
  steamTradeOfferUrl,
} from './manual-accept-assist.js';

function trade(
  overrides: Partial<TradeVerificationResult> = {},
): TradeVerificationResult {
  return {
    orderId: 'order-accept',
    orderShortId: 'order-ac',
    role: 'buyer',
    orderStatus: 'WAITING_TRADE',
    offerId: '555666',
    verificationStatus: 'verified',
    checks: [],
    item: {
      marketHashName: 'AWP | Asiimov',
      floatValue: '0.2',
      wear: 'FT',
      iconUrl: null,
      assetExternalId: 'a1',
    },
    counterparty: {
      userId: 's1',
      username: 'seller',
      steamId: '76561198000000001',
      personaName: 'Seller',
      avatarUrl: null,
    },
    escrow: { holdAmountMinor: '1000', status: 'active' },
    acknowledgments: {
      sellerAckSent: true,
      buyerPreAccept: false,
      buyerReceived: false,
    },
    nextAction: {
      kind: 'accept_in_steam',
      title: 'Accept',
      description: 'x',
    },
    siteUrl: 'https://p2pcs.ru/orders/order-accept',
    amountMinor: '2500',
    buyerTradeUrl: null,
    ...overrides,
  };
}

describe('manual-accept-assist', () => {
  it('allows only verified buyer deals ready to accept', () => {
    expect(canShowManualAcceptAssist(trade())).toBe(true);
    expect(
      canShowManualAcceptAssist(trade({ role: 'seller' })),
    ).toBe(false);
    expect(
      canShowManualAcceptAssist(
        trade({ verificationStatus: 'mismatch' }),
      ),
    ).toBe(false);
    expect(
      canShowManualAcceptAssist(trade({ offerId: null })),
    ).toBe(false);
    expect(
      canShowManualAcceptAssist(
        trade({
          nextAction: {
            kind: 'report_issue',
            title: 'x',
            description: 'x',
          },
        }),
      ),
    ).toBe(false);
  });

  it('builds list deep-link CTA next to verified badge', () => {
    const cta = buildManualAcceptListCta(trade());
    expect(cta?.label).toBe('Принять (Steam)');
    expect(cta?.href).toBe(steamTradeOfferUrl('555666'));
    expect(cta?.href).toContain('/tradeoffer/555666/');
  });

  it('builds double-confirm copy for offer page', () => {
    expect(buildOfferAcceptAssistView({ phase: 'ready' }).primaryLabel).toBe(
      'Принять (Steam)',
    );
    expect(buildOfferAcceptAssistView({ phase: 'armed' }).primaryLabel).toMatch(
      /Подтвердить Accept/i,
    );
    expect(buildOfferAcceptAssistView({ phase: 'armed' }).secondaryLabel).toBe(
      'Отмена',
    );
  });
});

describe('manual-accept-assist DOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds AcceptTradeOffer and ConfirmTradeOffer controls', () => {
    document.body.innerHTML = `
      <div id="trade_confirmbtn" onclick="ConfirmTradeOffer();">Confirm</div>
      <a class="btn_green_white_innerfade" onclick="AcceptTradeOffer();">Accept Trade</a>
    `;
    const controls = findSteamAcceptControls(document);
    expect(controls.some((entry) => entry.kind === 'accept')).toBe(true);
    expect(controls.some((entry) => entry.kind === 'confirm')).toBe(true);
    expect(pickSteamAcceptControl(controls, 'accept')?.kind).toBe('accept');
  });

  it('clicks accept control only when provided', () => {
    const button = document.createElement('button');
    button.textContent = 'Accept Trade';
    button.onclick = () => {
      button.dataset.clicked = '1';
    };
    document.body.appendChild(button);
    const control = pickSteamAcceptControl(findSteamAcceptControls(document));
    const result = clickSteamAcceptControl(control);
    expect(result.ok).toBe(true);
    expect(button.dataset.clicked).toBe('1');
    expect(clickSteamAcceptControl(null).ok).toBe(false);
  });
});
