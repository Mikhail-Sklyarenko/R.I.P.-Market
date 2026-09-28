import {
  SteamAuthProbeService,
  PROBE_SELLER,
} from './steam-auth-probe.service';
import { PrismaService } from '../prisma/prisma.service';

describe('temporary Steam auth probe', () => {
  const token = 'synthetic-test-token-not-a-real-credential';
  const originalFetch = global.fetch;
  const previousWindow = process.env.STEAM_AUTH_PROBE_UNTIL;
  let user: jest.Mock;
  let fetchMock: jest.Mock;
  let service: SteamAuthProbeService;
  beforeEach(() => {
    process.env.STEAM_AUTH_PROBE_UNTIL = new Date(
      Date.now() + 600000,
    ).toISOString();
    user = jest.fn().mockResolvedValue({
      steamId: PROBE_SELLER,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    service = new SteamAuthProbeService({
      user: { findUnique: user },
    } as unknown as PrismaService);
    fetchMock = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response('{"response":{}}')),
      );
    global.fetch = fetchMock;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (previousWindow === undefined) delete process.env.STEAM_AUTH_PROBE_UNTIL;
    else process.env.STEAM_AUTH_PROBE_UNTIL = previousWindow;
  });
  it.each([
    '',
    'invalid',
    new Date(0).toISOString(),
    new Date(Date.now() + 86400000).toISOString(),
  ])(
    'rejects closed or excessive window %s before outbound access',
    async (until) => {
      process.env.STEAM_AUTH_PROBE_UNTIL = until;
      await expect(
        service.run('user', { accessToken: token, consent: true }),
      ).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([
    { steamId: '76561198655632881', role: 'ADMIN', status: 'ACTIVE' },
    { steamId: PROBE_SELLER, role: 'SELLER', status: 'ACTIVE' },
    { steamId: PROBE_SELLER, role: 'ADMIN', status: 'SUSPENDED' },
    null,
  ])('rejects unauthorized participant %j', async (actor) => {
    user.mockResolvedValue(actor);
    await expect(
      service.run('user', { accessToken: token, consent: true }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires fresh explicit consent', async () => {
    await expect(service.run('user', { accessToken: token })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('limits destinations, strips body token, never echoes arbitrary Steam content and rate limits retries', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ response: { malicious: token } })),
      ),
    );
    const payload: Record<string, unknown> = {
      accessToken: token,
      consent: true,
    };
    const result = await service.run('user', payload);
    expect(payload).not.toHaveProperty('accessToken');
    expect(JSON.stringify(result)).not.toContain(token);
    expect(result).toMatchObject({
      exactOffer: false,
      exactReceipt: false,
      settlementAuthorized: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls as [URL, RequestInit][]) {
      expect(call[0].origin).toBe('https://api.steampowered.com');
      expect(call[1].redirect).toBe('error');
      expect(call[1].signal).toBeDefined();
    }
    await expect(
      service.run('user', { accessToken: token, consent: true }),
    ).rejects.toThrow('cooldown');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('sanitizes network errors containing credentials', async () => {
    fetchMock.mockRejectedValue(new Error(token));
    const result = await service.run('user', {
      accessToken: token,
      consent: true,
    });
    expect(result.offerHttpStatus).toBe(0);
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it('rejects oversized and malformed responses without echo', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('x'.repeat(262145)))
      .mockResolvedValueOnce(new Response('invalid ' + token));
    const result = await service.run('user', {
      accessToken: token,
      consent: true,
    });
    expect(result.exactReceipt).toBe(false);
    expect(result.exactOffer).toBe(false);
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it('reports protected receipt without authorizing settlement', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              offer: {
                tradeofferid: '9391832342',
                trade_offer_state: 3,
                is_our_offer: true,
                accountid_other: Number(
                  76561198655632881n - 76561197960265728n,
                ),
                items_to_give: [
                  {
                    appid: 730,
                    contextid: '2',
                    assetid: '50586823960',
                    amount: '1',
                  },
                ],
                items_to_receive: [],
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: {
              trades: [
                {
                  tradeid: '744938690018752002',
                  status: 3,
                  steamid_other: '76561198655632881',
                  assets_given: [
                    {
                      appid: 730,
                      contextid: '2',
                      assetid: '50586823960',
                      amount: '1',
                      new_contextid: '16',
                      new_assetid: '53954582039',
                    },
                  ],
                  assets_received: [],
                },
              ],
            },
          }),
        ),
      );
    expect(
      await service.run('user', { accessToken: token, consent: true }),
    ).toMatchObject({
      exactOffer: true,
      offerMatchesOrder: true,
      exactReceipt: true,
      protectedContext: true,
      receiptMappingVerified: false,
      settlementAuthorized: false,
    });
  });
});
