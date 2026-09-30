import { steamTokenOwner } from './steam-token-owner';
const owner = '76561198195181115';
it.each([
  { steamid: owner },
  { response: { steamid: owner } },
  { steamid: owner, response: { steamid: owner } },
])('reads an explicit consistent Steam identity', (value) => {
  expect(steamTokenOwner(value)).toBe(owner);
});
it.each([
  null,
  [],
  {},
  { response: {} },
  { steamid: Number('76561198195181115') },
  { steamid: owner, response: { steamid: '76561198655632881' } },
  { steamid: owner, response: { steamid: 123 } },
  { sub: owner },
  { steamid: owner, error: 'denied' },
  { steamid: owner, success: false },
  { response: { steamid: owner, error: 'denied' } },
  { steamid: 'not-an-id' },
])('rejects absent, ambiguous or rejected identities', (value) => {
  expect(steamTokenOwner(value)).toBeNull();
});
