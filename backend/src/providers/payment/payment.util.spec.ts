import {
  isValidTronAddress,
  signGatewayWebhook,
  sunToUsdMinor,
  usdMinorToSun,
  verifyGatewayWebhookSignature,
} from './payment.util';

describe('payment.util', () => {
  it('converts sun to usd minor 1:1 policy (1 USDT = 100 minor cents)', () => {
    expect(sunToUsdMinor(1_000_000n)).toBe(100n);
    expect(usdMinorToSun(100n)).toBe(1_000_000n);
    expect(sunToUsdMinor(5_000_000n)).toBe(500n);
  });

  it('validates tron addresses', () => {
    expect(isValidTronAddress('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')).toBe(true);
    expect(isValidTronAddress('invalid')).toBe(false);
  });

  it('verifies webhook signatures', () => {
    const secret = 'test-webhook-secret';
    const body = JSON.stringify({ eventId: 'evt-1', type: 'deposit.credited' });
    const signature = signGatewayWebhook(secret, body);

    expect(verifyGatewayWebhookSignature(secret, body, signature)).toBe(true);
    expect(verifyGatewayWebhookSignature(secret, body, 'bad-signature')).toBe(false);
    expect(verifyGatewayWebhookSignature(secret, body, undefined)).toBe(false);
  });
});
