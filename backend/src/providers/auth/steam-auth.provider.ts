import { HttpStatus, Injectable } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  AuthLoginParams,
  AuthLoginResult,
  AuthProvider,
} from './auth-provider.interface';
import { SteamProfileService } from './steam-profile.service';
import {
  parseSteamId64FromClaimedId,
  verifySteamOpenId,
} from './steam-openid.util';

@Injectable()
export class SteamAuthProvider implements AuthProvider {
  readonly type = 'steam' as const;

  constructor(
    private readonly usersService: UsersService,
    private readonly steamProfileService: SteamProfileService,
  ) {}

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

  async login(params: AuthLoginParams): Promise<AuthLoginResult> {
    if (params.kind !== 'steam') {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Steam auth provider only supports Steam OpenID login',
        HttpStatus.BAD_REQUEST,
      );
    }

    const steamId = await this.verifyAndParseSteamId(params.openidParams);
    const summary = await this.steamProfileService.fetchPlayerSummary(steamId);
    const user = await this.usersService.upsertBySteamId(
      steamId,
      summary.personaname ?? undefined,
      {
        personaName: summary.personaname,
        avatarUrl: summary.avatarUrl,
      },
    );

    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      steamId: user.steamId,
    };
  }

  async verifyAndParseSteamId(
    openidParams: Record<string, string>,
  ): Promise<string> {
    let verified: Awaited<ReturnType<typeof verifySteamOpenId>>;
    try {
      verified = await verifySteamOpenId(openidParams);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Steam HTTP request failed';
      throw new AppException(
        ErrorCode.STEAM_AUTH_FAILED,
        `Не удалось связаться со Steam для проверки входа (${detail}). Попробуйте ещё раз.`,
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!verified.ok) {
      if (verified.reason === 'blocked') {
        throw new AppException(
          ErrorCode.STEAM_AUTH_FAILED,
          'Steam блокирует проверку входа с этого сервера (403). Войдите через Mock или попробуйте позже.',
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw new AppException(
        ErrorCode.STEAM_AUTH_FAILED,
        'Steam OpenID verification failed',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const claimedId = openidParams['openid.claimed_id'];
    const steamId = claimedId ? parseSteamId64FromClaimedId(claimedId) : null;
    if (!steamId) {
      throw new AppException(
        ErrorCode.STEAM_AUTH_FAILED,
        'Invalid Steam claimed_id',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return steamId;
  }
}
