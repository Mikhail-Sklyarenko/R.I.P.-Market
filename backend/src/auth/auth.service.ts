import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
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
import { getPublicSiteOriginFromEnv } from '../common/public-site-url.util';
import { UsersService } from '../users/users.service';
import { MockLoginDto } from './dto/mock-login.dto';
import { getApiPublicBaseUrl } from './steam-api-base.util';

const STEAM_LINK_PURPOSE = 'steam_link';
const STEAM_LINK_EXPIRES_IN = '10m';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly steamProfileService: SteamProfileService,
    private readonly mockAuthProvider: MockAuthProvider,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async mockLogin(dto: MockLoginDto) {
    if (process.env.NODE_ENV === 'production')
      throw new BadRequestException('Mock login disabled in production');
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

  async getSessionUser(userId: string) {
    const user = await this.usersService.getById(userId);
    return {
      id: user.id,
      username: user.username,
      role: user.role as string,
      status: user.status as string,
      steamId: user.steamId ?? null,
      steamPersonaName: user.steamPersonaName ?? null,
      steamAvatarUrl: user.steamAvatarUrl ?? null,
      tradeUrl: user.tradeUrl ?? null,
    };
  }

  async steamCallback(
    openidParams: Record<string, string>,
    linkState?: string,
  ) {
    const linkUserId = linkState
      ? await this.verifySteamLinkState(linkState)
      : null;
    if (linkUserId) {
      return this.steamLink(linkUserId, openidParams);
    }

    const user = await this.authProvider.login({
      kind: 'steam',
      openidParams,
    });
    return this.buildAuthResponse(user);
  }

  async getSteamLinkLoginUrl(userId: string) {
    this.requireSteamProvider();
    const linkState = await this.createSteamLinkState(userId);
    const returnUrl = `${getApiPublicBaseUrl()}/auth/steam/callback?link_state=${encodeURIComponent(linkState)}`;
    return this.getSteamLoginUrl(returnUrl);
  }

  async steamLink(userId: string, openidParams: Record<string, string>) {
    const steamProvider = this.requireSteamProvider();
    const steamId = await steamProvider.verifyAndParseSteamId(openidParams);
    const summary = await this.steamProfileService.fetchPlayerSummary(steamId);
    const user = await this.usersService.linkSteamId(userId, steamId, {
      personaName: summary.personaname ?? undefined,
      avatarUrl: summary.avatarUrl ?? undefined,
    });

    return this.buildAuthResponse({
      userId: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      steamId: user.steamId,
      steamPersonaName: user.steamPersonaName,
      steamAvatarUrl: user.steamAvatarUrl,
      tradeUrl: user.tradeUrl,
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

  async buildFrontendCallbackUrl(
    authResponse: Awaited<ReturnType<AuthService['buildAuthResponse']>>,
    extraParams?: Record<string, string>,
  ) {
    const code = randomBytes(32).toString('hex');
    await this.prisma.authExchangeCode.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.prisma.authExchangeCode.create({
      data: {
        codeHash: this.hashCode(code),
        userId: authResponse.user.id,
        purpose: 'login',
        expiresAt: new Date(Date.now() + 90_000),
      },
    });
    const params = new URLSearchParams({ code, ...extraParams });
    return `${getPublicSiteOriginFromEnv()}/login/steam/callback?${params.toString()}`;
  }

  async exchangeCode(code: string) {
    if (!/^[a-f0-9]{64}$/.test(code))
      throw new BadRequestException('Invalid login code');
    const userId = await this.consumeCode(code, 'login');
    const user = await this.getSessionUser(userId);
    return this.buildAuthResponse({ ...user, userId: user.id });
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
  private async consumeCode(code: string, purpose: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.authExchangeCode.findUnique({
        where: { codeHash: this.hashCode(code) },
      });
      if (!row || row.purpose !== purpose || row.expiresAt <= new Date())
        throw new BadRequestException('Login code expired or already used');
      const claimed = await tx.authExchangeCode.deleteMany({
        where: { codeHash: row.codeHash, expiresAt: { gt: new Date() } },
      });
      if (claimed.count !== 1)
        throw new BadRequestException('Login code already used');
      return row.userId;
    });
  }

  private async createSteamLinkState(userId: string): Promise<string> {
    const token = await this.jwtService.signAsync(
      {
        sub: userId,
        purpose: STEAM_LINK_PURPOSE,
        nonce: randomBytes(16).toString('hex'),
      },
      { expiresIn: STEAM_LINK_EXPIRES_IN },
    );
    await this.prisma.authExchangeCode.create({
      data: {
        codeHash: this.hashCode(token),
        userId,
        purpose: STEAM_LINK_PURPOSE,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    return token;
  }

  private async verifySteamLinkState(token: string): Promise<string> {
    const payload = await this.jwtService.verifyAsync<{
      sub?: string;
      purpose?: string;
    }>(token);
    if (payload.purpose !== STEAM_LINK_PURPOSE || !payload.sub)
      throw new BadRequestException('Invalid Steam link state');
    const userId = await this.consumeCode(token, STEAM_LINK_PURPOSE);
    if (userId !== payload.sub)
      throw new BadRequestException('Invalid Steam link subject');
    return userId;
  }

  private async buildAuthResponse(
    user: {
      userId: string;
      username: string;
      role: string;
      status: string;
      steamId?: string | null;
      steamPersonaName?: string | null;
      steamAvatarUrl?: string | null;
      tradeUrl?: string | null;
    },
    providerOverride?: string,
  ) {
    const payload = { sub: user.userId, role: user.role, purpose: 'access' };
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
        steamPersonaName: user.steamPersonaName ?? null,
        steamAvatarUrl: user.steamAvatarUrl ?? null,
        tradeUrl: user.tradeUrl ?? null,
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
