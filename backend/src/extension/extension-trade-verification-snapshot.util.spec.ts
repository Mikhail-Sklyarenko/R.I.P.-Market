import {
  buildExtensionVerificationPayload,
  isDurableMismatch,
  mapExtensionVerificationSnapshot,
  shouldPersistExtensionVerification,
} from './extension-trade-verification-snapshot.util';

describe('extension-trade-verification-snapshot.util', () => {
  it('persists verified/partial to clear false mismatch; mismatch only when durable', () => {
    expect(
      shouldPersistExtensionVerification({ status: 'verified' }),
    ).toBe(true);
    expect(
      shouldPersistExtensionVerification({ status: 'partial' }),
    ).toBe(true);
    expect(
      shouldPersistExtensionVerification({
        status: 'mismatch',
        checks: [
          {
            key: 'offer_id_match',
            passed: false,
            label: 'Открыт другой обмен',
            severity: 'warn',
          },
        ],
      }),
    ).toBe(false);
    expect(
      shouldPersistExtensionVerification({
        status: 'mismatch',
        checks: [
          {
            key: 'item_asset_match',
            passed: false,
            label: 'Asset ID не совпадает',
            severity: 'error',
          },
        ],
      }),
    ).toBe(true);
    expect(
      isDurableMismatch({
        status: 'mismatch',
        checks: [
          {
            key: 'partner_steam_match',
            passed: false,
            label: 'не совпадает',
            severity: 'error',
          },
        ],
      }),
    ).toBe(true);
  });

  it('maps snapshot payload for order API', () => {
    const mapped = mapExtensionVerificationSnapshot({
      observedStatus: 'mismatch',
      match: false,
      createdAt: new Date('2026-08-26T12:00:00.000Z'),
      payload: {
        offerId: '123',
        checks: [
          {
            key: 'item_asset_match',
            passed: false,
            label: 'Asset ID не совпадает',
            severity: 'error',
          },
          {
            key: 'escrow_active',
            passed: true,
            label: 'ok',
            severity: 'ok',
          },
        ],
        nextAction: {
          kind: 'report_issue',
          title: 'Обмен не совпадает с заказом',
          description: 'Не принимайте',
        },
      },
    });

    expect(mapped).toEqual({
      status: 'mismatch',
      match: false,
      updatedAt: '2026-08-26T12:00:00.000Z',
      offerId: '123',
      failedChecks: [
        {
          key: 'item_asset_match',
          label: 'Asset ID не совпадает',
          severity: 'error',
        },
      ],
      nextAction: {
        kind: 'report_issue',
        title: 'Обмен не совпадает с заказом',
        description: 'Не принимайте',
      },
    });
  });

  it('builds payload for persistence', () => {
    const payload = buildExtensionVerificationPayload({
      checks: [],
      nextAction: {
        kind: 'report_issue',
        title: 't',
        description: 'd',
      },
      offerId: '1',
      role: 'buyer',
      observed: { assetId: 'a', floatValue: '0.1' },
    });
    expect(payload.offerId).toBe('1');
    expect(payload.observed).toEqual({ assetId: 'a', floatValue: '0.1' });
  });
});
