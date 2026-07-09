import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ExtensionSecurityService } from './extension-security.service';

describe('ExtensionSecurityService', () => {
  const prisma = {
    extensionSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
  const jwt = { verifyAsync: jest.fn(), signAsync: jest.fn() };
  const service = new ExtensionSecurityService(prisma as never, jwt as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects expired token', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('expired'));

    await expect(service.validateExtensionToken('bad-token')).rejects.toMatchObject({
      code: ErrorCode.EXTENSION_TOKEN_EXPIRED,
    } satisfies Partial<AppException>);
  });

  it('rejects revoked session', async () => {
    jwt.verifyAsync.mockResolvedValueOnce({
      sub: 'user-1',
      sid: 'sess-1',
      did: 'dev-1',
      jti: 'jti-1',
      typ: 'extension',
    });
    prisma.extensionSession.findUnique.mockResolvedValueOnce({
      id: 'sess-1',
      userId: 'user-1',
      deviceId: 'dev-1',
      tokenJti: 'jti-1',
      status: 'REVOKED',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 10000),
      device: { status: 'ACTIVE' },
    });

    await expect(service.validateExtensionToken('token')).rejects.toMatchObject({
      code: ErrorCode.EXTENSION_SESSION_REVOKED,
    } satisfies Partial<AppException>);
  });
});
