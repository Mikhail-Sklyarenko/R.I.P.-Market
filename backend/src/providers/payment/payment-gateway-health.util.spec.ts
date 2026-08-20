import { checkCryptoGatewayHealth } from './payment-gateway-health.util';

describe('checkCryptoGatewayHealth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns disabled when payment provider is mock', async () => {
    process.env.PAYMENT_PROVIDER = 'mock';
    await expect(checkCryptoGatewayHealth()).resolves.toEqual({
      status: 'disabled',
    });
  });

  it('returns unavailable when gateway URL or API key is missing', async () => {
    process.env.PAYMENT_PROVIDER = 'crypto_tron';
    process.env.CRYPTO_GATEWAY_URL = '';
    process.env.CRYPTO_GATEWAY_API_KEY = '';

    await expect(checkCryptoGatewayHealth()).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('returns ok when gateway health responds successfully', async () => {
    process.env.PAYMENT_PROVIDER = 'crypto_tron';
    process.env.CRYPTO_GATEWAY_URL = 'http://gateway.test';
    process.env.CRYPTO_GATEWAY_API_KEY = 'secret';

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);

    const result = await checkCryptoGatewayHealth();
    expect(result.status).toBe('ok');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('NORTH falls back to /v1/integration when /v1/health is down', async () => {
    process.env.PAYMENT_PROVIDER = 'north';
    process.env.NORTH_GATEWAY_URL = 'http://north.test';
    process.env.NORTH_GATEWAY_API_KEY = 'secret';

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    const result = await checkCryptoGatewayHealth();
    expect(result.status).toBe('ok');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://north.test/v1/health',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://north.test/v1/integration',
      expect.any(Object),
    );
  });

  it('returns unavailable when gateway health fails', async () => {
    process.env.PAYMENT_PROVIDER = 'crypto_tron';
    process.env.CRYPTO_GATEWAY_URL = 'http://gateway.test';
    process.env.CRYPTO_GATEWAY_API_KEY = 'secret';

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
    } as Response);

    await expect(checkCryptoGatewayHealth()).resolves.toMatchObject({
      status: 'unavailable',
    });
  });
});
