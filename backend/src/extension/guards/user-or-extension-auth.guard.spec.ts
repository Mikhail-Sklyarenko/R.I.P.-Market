import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { UserOrExtensionAuthGuard } from './user-or-extension-auth.guard';
import { ExtensionSecurityService } from '../extension-security.service';
import { UsersService } from '../../users/users.service';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppException } from '../../common/errors/app.exception';

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

describe('UserOrExtensionAuthGuard (I3)', () => {
  const previousChannel = process.env.ENABLE_EXTENSION_CHANNEL;

  beforeEach(() => {
    process.env.ENABLE_EXTENSION_CHANNEL = 'true';
  });

  afterAll(() => {
    if (previousChannel === undefined) {
      delete process.env.ENABLE_EXTENSION_CHANNEL;
    } else {
      process.env.ENABLE_EXTENSION_CHANNEL = previousChannel;
    }
  });

  function buildGuard(overrides?: {
    validateExtensionToken?: ExtensionSecurityService['validateExtensionToken'];
    resolveSessionUser?: UsersService['resolveSessionUser'];
  }) {
    const extensionSecurity = {
      validateExtensionToken:
        overrides?.validateExtensionToken ??
        jest.fn().mockResolvedValue({
          sessionId: 'sid',
          userId: 'user-1',
          deviceId: 'did',
          tokenJti: 'jti',
        }),
    } as unknown as ExtensionSecurityService;
    const usersService = {
      resolveSessionUser:
        overrides?.resolveSessionUser ??
        jest.fn().mockResolvedValue({ sub: 'user-1', role: 'SELLER' }),
    } as unknown as UsersService;
    return new UserOrExtensionAuthGuard(extensionSecurity, usersService);
  }

  function contextWithToken(token: string | null): {
    context: ExecutionContext;
    request: { headers: Record<string, string | undefined>; user?: unknown; extensionAuth?: unknown };
  } {
    const request: {
      headers: Record<string, string | undefined>;
      user?: unknown;
      extensionAuth?: unknown;
    } = {
      headers: {
        authorization: token ? `Bearer ${token}` : undefined,
      },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
    return { context, request };
  }

  it('rejects missing bearer', async () => {
    const guard = buildGuard();
    const { context } = contextWithToken(null);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts extension typ via session validation', async () => {
    const validateExtensionToken = jest.fn().mockResolvedValue({
      sessionId: 'sid-1',
      userId: 'user-1',
      deviceId: 'did-1',
      tokenJti: 'jti-1',
    });
    const guard = buildGuard({ validateExtensionToken });
    const token = makeJwt({ sub: 'user-1', typ: 'extension' });
    const { context, request } = contextWithToken(token);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(validateExtensionToken).toHaveBeenCalledWith(token);
    expect(request.user).toEqual({ sub: 'user-1', role: 'SELLER' });
    expect(request.extensionAuth).toEqual({
      sessionId: 'sid-1',
      userId: 'user-1',
      deviceId: 'did-1',
      tokenJti: 'jti-1',
    });
  });

  it('does not fall through when extension channel is disabled', async () => {
    process.env.ENABLE_EXTENSION_CHANNEL = 'false';
    const guard = buildGuard();
    const { context } = contextWithToken(
      makeJwt({ sub: 'user-1', typ: 'extension' }),
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(AppException);
    try {
      await guard.canActivate(context);
    } catch (error) {
      expect((error as AppException).code).toBe(
        ErrorCode.EXTENSION_CHANNEL_DISABLED,
      );
    }
  });
});
