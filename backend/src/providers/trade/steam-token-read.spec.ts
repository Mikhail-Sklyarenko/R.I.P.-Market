import { steamTokenRead } from './steam-token-read';
afterEach(() => jest.restoreAllMocks());
it('uses direct fixed HTTPS endpoint and rejects redirects', async () => {
  const mock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({ response: { steamid: '123' } })),
    );
  expect(
    await steamTokenRead('GetTokenDetails', 'synthetic-token'),
  ).toMatchObject({ status: 200, data: { response: { steamid: '123' } } });
  const [url, options] = mock.mock.calls[0];
  // URL object is scrubbed after the request completes.
  expect(String(url)).toBe(
    'https://api.steampowered.com/ISteamUserOAuth/GetTokenDetails/v1/',
  );
  expect(options?.redirect).toBe('error');
});
it('suppresses network exceptions and oversized response data', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockRejectedValueOnce(new Error('secret-token-in-url'))
    .mockResolvedValueOnce(new Response('x'.repeat(262145)));
  expect(await steamTokenRead('GetTradeOffer', 'synthetic-token')).toEqual({
    status: 0,
    data: null,
  });
  expect(await steamTokenRead('GetTradeOffer', 'synthetic-token')).toEqual({
    status: 200,
    data: null,
  });
});
