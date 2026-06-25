import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  AuthLoginParams,
  AuthLoginResult,
  AuthProvider,
} from './auth-provider.interface';

@Injectable()
export class SteamAuthProvider implements AuthProvider {
  readonly type = 'steam' as const;

  getSteamLoginUrl(returnUrl: string): string {
    const realm = process.env.STEAM_OPENID_REALM ?? 'http://localhost:3000';
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnUrl,
      'openid.realm': realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });

    return `https://steamcommunity.com/openid/login?${params.toString()}`;
  }

  login(_params: AuthLoginParams): Promise<AuthLoginResult> {
    return Promise.reject(
      new NotImplementedException(
        'Steam OpenID callback verification is not wired yet. See docs/steam-spike.md.',
      ),
    );
  }
}
