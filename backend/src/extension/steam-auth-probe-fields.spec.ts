import { probeFields } from './steam-auth-probe-fields';

describe('safe diagnostic mismatch predicates', () => {
  const buyer = '76561198655632881';
  const asset = '50586823960';
  const item = { appid: 730, contextid: '2', assetid: asset, amount: '1' };
  it('distinguishes exact mismatches from numeric JSON representation', () => {
    const result = probeFields(
      { items_to_give: [{ ...item, amount: 1 }] },
      { assets_given: [{ ...item, new_contextid: 16 }] },
      asset,
      buyer,
    );
    expect(result.offerItemAmountMatches).toBe(false);
    expect(result.offerItemAmountIsNumber).toBe(true);
    expect(result.receiptNewContextIs16Number).toBe(true);
    expect(result.receiptNewContextIs2).toBe(false);
  });
  it('does not confuse missing fields with a verified unprotected item', () => {
    const result = probeFields(null, {}, asset, buyer);
    expect(result.offerGivenCount).toBe(-1);
    expect(result.receiptNewContextPresent).toBe(false);
    expect(result.receiptNewAssetValid).toBe(false);
  });
  it('does not echo injected Steam strings or identifiers', () => {
    const marker = 'sensitive-upstream-content';
    const result = probeFields(
      {
        accountid_other: marker,
        items_to_give: [{ ...item, assetid: marker }],
      },
      { assets_given: [{ ...item, new_assetid: marker }] },
      asset,
      buyer,
    );
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(
      Object.values(result).every(
        (value) => typeof value === 'boolean' || typeof value === 'number',
      ),
    ).toBe(true);
  });
  it('identifies wrong counts, rollback fields and partner independently', () => {
    const result = probeFields(
      {
        is_our_offer: true,
        accountid_other: Number(BigInt(buyer) - 76561197960265728n),
        items_to_give: [item, item],
        items_to_receive: [item],
      },
      {
        assets_given: [
          {
            ...item,
            new_assetid: '53954582039',
            new_contextid: '2',
            rollback_new_assetid: '0',
          },
        ],
      },
      asset,
      buyer,
    );
    expect(result.offerPartnerMatches).toBe(true);
    expect(result.offerGivenCount).toBe(2);
    expect(result.offerReceivedEmpty).toBe(false);
    expect(result.receiptRollbackFieldsPresent).toBe(true);
  });
});
