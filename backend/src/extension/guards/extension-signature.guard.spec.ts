import { ExecutionContext } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'crypto';
import { ErrorCode } from '../../common/errors/error-codes';
import { signatureMessage } from '../extension-signature.util';
import { ExtensionSignatureGuard } from './extension-signature.guard';

describe('ExtensionSignatureGuard', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const prisma = {
    extensionDevice: { findUnique: jest.fn() },
    extensionNonce: { create: jest.fn() },
  };
  const security = { logSecurityError: jest.fn() };
  const guard = new ExtensionSignatureGuard(prisma as never, security as never);

  const session = {
    sessionId: 'sess-1',
    userId: 'user-1',
    deviceId: 'dev-1',
    tokenJti: 'jti-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.extensionDevice.findUnique.mockResolvedValue({
      publicKey: publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    });
    prisma.extensionNonce.create.mockResolvedValue({ id: 'nonce-id' });
  });

  function contextForBody(body: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ body, extensionAuth: session }),
      }),
    } as never;
  }

  it('rejects invalid signature', async () => {
    const payload = { commandId: 'cmd-1', status: 'ok' };
    const body = {
      deviceId: 'dev-1',
      nonce: 'nonce-1',
      timestampMs: Date.now(),
      ttlMs: 5000,
      payload,
      signature: Buffer.from('bad-signature').toString('base64'),
    };

    await expect(guard.canActivate(contextForBody(body))).rejects.toMatchObject(
      {
        code: ErrorCode.EXTENSION_SIGNATURE_INVALID,
      },
    );
  });

  it('rejects replay attempt on duplicate nonce', async () => {
    const payload = { commandId: 'cmd-1', status: 'ok' };
    const timestampMs = Date.now();
    const message = signatureMessage({
      sessionId: session.sessionId,
      deviceId: session.deviceId,
      nonce: 'nonce-2',
      timestampMs,
      ttlMs: 5000,
      payload,
    });
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(message, 'utf8'),
      privateKey,
    ).toString('base64');

    const body = {
      deviceId: 'dev-1',
      nonce: 'nonce-2',
      timestampMs,
      ttlMs: 5000,
      payload,
      signature,
    };
    prisma.extensionNonce.create.mockRejectedValueOnce(new Error('duplicate'));

    await expect(guard.canActivate(contextForBody(body))).rejects.toMatchObject(
      {
        code: ErrorCode.EXTENSION_REPLAY_DETECTED,
      },
    );
  });
});
