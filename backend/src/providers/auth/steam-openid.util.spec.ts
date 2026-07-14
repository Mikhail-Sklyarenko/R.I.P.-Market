import {
  extractOpenIdParams,
  parseSteamId64FromClaimedId,
  verifySteamOpenId,
} from './steam-openid.util';

describe('steam-openid.util', () => {
  describe('parseSteamId64FromClaimedId', () => {
    it('extracts steamId64 from claimed_id URL', () => {
      expect(
        parseSteamId64FromClaimedId(
          'https://steamcommunity.com/openid/id/76561198000000000',
        ),
      ).toBe('76561198000000000');
    });

    it('returns null for invalid claimed_id', () => {
      expect(parseSteamId64FromClaimedId('not-a-steam-url')).toBeNull();
      expect(parseSteamId64FromClaimedId('')).toBeNull();
    });
  });

  describe('verifySteamOpenId', () => {
    const baseParams = {
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'id_res',
      'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
      'openid.claimed_id':
        'https://steamcommunity.com/openid/id/76561198000000000',
      'openid.identity':
        'https://steamcommunity.com/openid/id/76561198000000000',
      'openid.return_to': 'http://localhost:3000/api/v1/auth/steam/callback',
      'openid.response_nonce': '2026-06-26T12:00:00Zabc',
      'openid.assoc_handle': '1234567890',
      'openid.signed':
        'mode,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
      'openid.sig': 'abc123',
    };

    it('returns invalid when mode is not id_res', async () => {
      const postFn = jest.fn();
      const result = await verifySteamOpenId(
        { ...baseParams, 'openid.mode': 'cancel' },
        postFn,
      );
      expect(result).toEqual({ ok: false, reason: 'invalid' });
      expect(postFn).not.toHaveBeenCalled();
    });

    it('posts check_authentication and returns ok when Steam confirms', async () => {
      const postFn = jest
        .fn()
        .mockResolvedValue(
          'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n',
        );
      const result = await verifySteamOpenId(baseParams, postFn);
      expect(result).toEqual({ ok: true });
      expect(postFn).toHaveBeenCalledWith(
        'https://steamcommunity.com/openid/login',
        expect.stringContaining('openid.mode=check_authentication'),
      );
    });

    it('returns invalid when Steam rejects verification', async () => {
      const postFn = jest.fn().mockResolvedValue('is_valid:false\n');
      const result = await verifySteamOpenId(baseParams, postFn);
      expect(result).toEqual({ ok: false, reason: 'invalid' });
    });

    it('returns blocked when Steam/CDN returns Access Denied', async () => {
      const postFn = jest.fn().mockResolvedValue({
        status: 403,
        body: '<HTML><TITLE>Access Denied</TITLE></HTML>',
      });
      const result = await verifySteamOpenId(baseParams, postFn);
      expect(result).toEqual({ ok: false, reason: 'blocked' });
    });
  });

  describe('extractOpenIdParams', () => {
    it('keeps only openid.* query keys', () => {
      expect(
        extractOpenIdParams({
          link_state: 'jwt-token',
          'openid.mode': 'id_res',
          'openid.claimed_id':
            'https://steamcommunity.com/openid/id/76561198000000000',
        }),
      ).toEqual({
        'openid.mode': 'id_res',
        'openid.claimed_id':
          'https://steamcommunity.com/openid/id/76561198000000000',
      });
    });
  });
});
