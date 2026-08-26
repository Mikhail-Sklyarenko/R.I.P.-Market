import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { UsersService } from '../../users/users.service';
import type { AuthUser } from '../../common/auth-user.interface';
import type { ExtensionAuthContext } from '../extension-request-context';
import { isExtensionChannelEnabled } from '../extension-channel.config';
import { ExtensionSecurityService } from '../extension-security.service';
import { extractBearerToken, peekJwtTyp } from '../jwt-peek.util';

type DualAuthRequest = {
  headers: Record<string, string | undefined>;
  user?: AuthUser;
  extensionAuth?: ExtensionAuthContext;
};

/**
 * I3: Listing-from-extension auth.
 * - `typ: 'extension'` → ExtensionSecurityService (session/jti/device)
 * - otherwise → user JWT (Passport)
 * Never falls through an extension-typed token to JwtAuthGuard.
 */
@Injectable()
export class UserOrExtensionAuthGuard
  extends AuthGuard('jwt')
  implements CanActivate
{
  constructor(
    private readonly extensionSecurity: ExtensionSecurityService,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DualAuthRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Bearer token is required');
    }

    if (peekJwtTyp(token) === 'extension') {
      if (!isExtensionChannelEnabled()) {
        throw new AppException(
          ErrorCode.EXTENSION_CHANNEL_DISABLED,
          'Extension channel is disabled',
        );
      }
      const session =
        await this.extensionSecurity.validateExtensionToken(token);
      const user = await this.usersService.resolveSessionUser(session.userId);
      if (!user) {
        throw new UnauthorizedException(
          'Your session is no longer valid. Please sign in again.',
        );
      }
      request.user = user;
      request.extensionAuth = {
        sessionId: session.sessionId,
        userId: session.userId,
        deviceId: session.deviceId,
        tokenJti: session.tokenJti,
      };
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
