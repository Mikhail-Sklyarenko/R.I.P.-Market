import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/auth-user.interface';
import { UsersService } from '../users/users.service';

type JwtPayload = AuthUser & { purpose?: string; typ?: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-jwt-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (
      (payload.purpose && payload.purpose !== 'access') ||
      (payload.typ && payload.typ !== 'access')
    )
      throw new UnauthorizedException('Invalid token purpose');
    const user = await this.usersService.resolveSessionUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException(
        'Your session is no longer valid. Please sign in again.',
      );
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(
        'Your account is suspended. Contact support if you need help.',
      );
    }
    return user;
  }
}
