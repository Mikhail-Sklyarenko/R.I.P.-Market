import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MockAuthProvider } from '../providers/auth/mock-auth.provider';
import { getProvidersConfig } from '../providers/config';
import { AUTH_PROVIDER } from '../providers/tokens';
import type { AuthProvider } from '../providers/auth/auth-provider.interface';
import { SteamAuthProvider } from '../providers/auth/steam-auth.provider';
import { SteamProfileService } from '../providers/auth/steam-profile.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { UsersService } from '../users/users.service';
import { MockLoginDto } from './dto/mock-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly steamProfileService: SteamProfileService,
    private readonly mockAuthProvider: MockAuthProvider,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async mockLogin(dto: MockLoginDto) {
    const config = getProvidersConfig();
    if (
      config.auth === 'steam' &&
      process.env.ALLOW_MOCK_LOGIN_IN_STEAM_MODE !== 'true'
    ) {
      throw new BadRequestException(
        'Mock login is disabled when AUTH_PROVIDER=steam',
      );
    }

    const user = await this.mockAuthProvider.login({
      kind: 'mock',
      role: dto.role,
    });
    return this.buildAuthResponse(user, 'mock');
  }

  async steamCallback(openidParams: Record<string, string>) {
    const user = await this.authProvider.login({
      kind: 'steam',
      openidParams,
    });
    return this.buildAuthResponse(user);
  }

  async steamLink(userId: string, openidParams: Record<string, string>) {
    const steamProvider = this.requireSteamProvider();
    const steamId = await steamProvider.verifyAndParseSteamId(openidParams);
    const username = await this.steamProfileService.fetchPersonaName(steamId);
    const user = await this.usersService.linkSteamId(
      userId,
      steamId,
      username ?? undefined,
    );

    return this.buildAuthResponse({
      userId: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      steamId: user.steamId,
    });
  }

  getSteamLoginUrl(returnUrl: string) {
    if (!this.authProvider.getSteamLoginUrl) {
      return null;
    }
    return {
      url: this.authProvider.getSteamLoginUrl(returnUrl),
      provider: this.authProvider.type,
    };
  }

  buildFrontendCallbackUrl(authResponse: Awaited<ReturnType<AuthService['buildAuthResponse']>>) {
    const frontendOrigin =
      process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
    const origin = frontendOrigin.split(',')[0]?.trim() ?? frontendOrigin;
    const params = new URLSearchParams({
      accessToken: authResponse.accessToken,
      userId: authResponse.user.id,
      username: authResponse.user.username,
      role: authResponse.user.role,
      status: authResponse.user.status,
    });
    if (authResponse.user.steamId) {
      params.set('steamId', authResponse.user.steamId);
    }
    return `${origin}/login/steam/callback?${params.toString()}`;
  }

  private async buildAuthResponse(
    user: {
      userId: string;
      username: string;
      role: string;
      status: string;
      steamId?: string | null;
    },
    providerOverride?: string,
  ) {
    const payload = { sub: user.userId, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      user: {
        id: user.userId,
        username: user.username,
        role: user.role,
        status: user.status,
        steamId: user.steamId ?? null,
      },
      provider: providerOverride ?? this.authProvider.type,
    };
  }

  private requireSteamProvider(): SteamAuthProvider {
    if (this.authProvider.type !== 'steam') {
      throw new AppException(
        ErrorCode.BAD_REQUEST,
        'Steam auth is not available with the current auth provider',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.authProvider as SteamAuthProvider;
  }
}
