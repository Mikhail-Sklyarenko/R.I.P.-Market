import { describe, expect, it } from 'vitest';
import {
  buildGuidedCompareRows,
  buildSupportIssueUrl,
  buyerOfferPagePrimaryHint,
  guidedGateHeadline,
} from './trade-offer-guided-gate.js';

describe('trade-offer-guided-gate', () => {
  it('builds mismatch and verified headlines', () => {
    expect(guidedGateHeadline('mismatch', 'buyer').tone).toBe('error');
    expect(guidedGateHeadline('verified', 'buyer').title).toBe('Скин совпал');
  });

  it('compares expected vs observed rows', () => {
    const rows = buildGuidedCompareRows(
      {
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        floatValue: '0.25',
        wear: 'FT',
        iconUrl: null,
        assetExternalId: '111',
      },
      {
        assetId: '111',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        floatValue: '0.25',
      },
    );
    expect(rows.find((row) => row.key === 'asset')?.tone).toBe('ok');
    expect(rows.find((row) => row.key === 'float')?.tone).toBe('ok');
  });

  it('flags asset mismatch', () => {
    const rows = buildGuidedCompareRows(
      {
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        floatValue: null,
        wear: null,
        iconUrl: null,
        assetExternalId: '111',
      },
      { assetId: '999', marketHashName: 'AK-47 | Redline (Field-Tested)' },
    );
    expect(rows.find((row) => row.key === 'asset')?.tone).toBe('error');
  });

  it('only urges Steam accept when verified', () => {
    expect(buyerOfferPagePrimaryHint('verified').kind).toBe('accept_steam');
    expect(buyerOfferPagePrimaryHint('mismatch').kind).toBe('block');
    expect(buyerOfferPagePrimaryHint('partial').kind).toBe('wait');
  });

  it('builds support issue url from site order url', () => {
    expect(
      buildSupportIssueUrl('https://p2pcs.ru/orders/abc-123', 'abc-123'),
    ).toBe(
      'https://p2pcs.ru/support?dealId=abc-123&topic=deal&reason=trade_problem',
    );
  });
});
