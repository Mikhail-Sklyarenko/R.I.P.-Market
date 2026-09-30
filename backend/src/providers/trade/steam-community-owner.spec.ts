import { steamCommunityOwner } from './steam-community-owner';
const owner = '76561198195181115';
const token = 'synthetic-invalid-token-not-a-real-credential';
afterEach(() => jest.restoreAllMocks());
it.each([
  '/login/home/',
  'https://evil.invalid/profiles/' + owner + '/',
  'http://steamcommunity.com/profiles/' + owner + '/',
  'https://user:pass@steamcommunity.com/profiles/' + owner + '/',
  '/tradeoffer/new/',
])('rejects non-profile and unsafe redirects %s', async (location) => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response(null, { status: 302, headers: { location } }),
    );
  expect((await steamCommunityOwner(token, owner)).owner).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('requires authenticated redirect, never accepts a public 200 profile', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(
      new Response('<profile><steamID64>' + owner + '</steamID64></profile>'),
    );
  expect((await steamCommunityOwner(token, owner)).owner).toBeNull();
});
it('reads identity selected by Steam and does not infer it from expected owner', async () => {
  const other = '76561198655632881';
  const mock = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: '/profiles/' + other + '/' },
    }),
  );
  expect((await steamCommunityOwner(token, owner)).owner).toBe(other);
  expect(mock.mock.calls[0][0]).toBe('https://steamcommunity.com/my/?xml=1');
  expect(mock.mock.calls[0][1]?.redirect).toBe('manual');
});
it('resolves Steam-selected vanity without forwarding token to second request', async () => {
  const mock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: '/id/example/' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        '<?xml version="1.0"?><profile><steamID64>' +
          owner +
          '</steamID64></profile>',
      ),
    );
  expect((await steamCommunityOwner(token, owner)).owner).toBe(owner);
  expect(mock.mock.calls[1][1]?.headers).toBeUndefined();
  expect(mock.mock.calls[1][1]?.redirect).toBe('error');
});
it.each([
  '<profile><name><![CDATA[<steamID64>' +
    owner +
    '</steamID64>]]></name></profile>',
  '<!DOCTYPE profile><profile><steamID64>' + owner + '</steamID64></profile>',
  'x'.repeat(262145),
])('rejects misleading or oversized XML', async (text) => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: '/id/example/' },
      }),
    )
    .mockResolvedValueOnce(new Response(text));
  expect((await steamCommunityOwner(token, owner)).owner).toBeNull();
});
it('suppresses credential-bearing transport errors', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error(token));
  expect(await steamCommunityOwner(token, owner)).toEqual({
    owner: null,
    status: 0,
  });
});
