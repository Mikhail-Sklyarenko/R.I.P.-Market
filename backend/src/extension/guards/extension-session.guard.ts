import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { isExtensionChannelEnabled } from '../extension-channel.config';
import { ExtensionSecurityService } from '../extension-security.service';
import type { ExtensionAuthContext } from '../extension-request-context';

@Injectable()
export class ExtensionSessionGuard implements CanActivate {
  constructor(private readonly extensionSecurity: ExtensionSecurityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isExtensionChannelEnabled()) {
      throw new AppException(
        ErrorCode.EXTENSION_CHANNEL_DISABLED,
        'Extension channel is disabled',
      );
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      extensionAuth?: ExtensionAuthContext;
    }>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      await this.extensionSecurity.logSecurityError('EXT_SEC_MISSING_BEARER', {
        path: request.headers['x-original-uri'] ?? 'unknown',
      });
      throw new UnauthorizedException('Bearer token is required');
    }

    const token = authHeader.slice('Bearer '.length);
    const session = await this.extensionSecurity.validateExtensionToken(token);
    request.extensionAuth = {
      sessionId: session.sessionId,
      userId: session.userId,
      deviceId: session.deviceId,
      tokenJti: session.tokenJti,
    };
    return true;
  }
}
