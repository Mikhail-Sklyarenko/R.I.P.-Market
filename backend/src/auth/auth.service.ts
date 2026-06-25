import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MockLoginDto } from './dto/mock-login.dto';
import { AUTH_PROVIDER } from '../providers/tokens';
import type { AuthProvider } from '../providers/auth/auth-provider.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  async mockLogin(dto: MockLoginDto) {
    const user = await this.authProvider.login({
      kind: 'mock',
      role: dto.role,
    });
    const payload = { sub: user.userId, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.userId,
        username: user.username,
        role: user.role,
        status: user.status,
      },
      provider: this.authProvider.type,
    };
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
}
