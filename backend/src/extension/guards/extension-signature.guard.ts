import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import {
  extensionMaxClockSkewMs,
  extensionMaxTtlMs,
} from '../extension-channel.config';
import { signatureMessage, verifySignature } from '../extension-signature.util';
import { ExtensionSecurityService } from '../extension-security.service';
import type { ExtensionAuthContext } from '../extension-request-context';

type SignedBody = {
  deviceId: string;
  nonce: string;
  timestampMs: number;
  ttlMs: number;
  payload: Record<string, unknown>;
  signature: string;
};

@Injectable()
export class ExtensionSignatureGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly extensionSecurity: ExtensionSecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ body: SignedBody; extensionAuth?: ExtensionAuthContext }>();
    const session = request.extensionAuth;
    const body = request.body;
    if (!session || !body) {
      throw new AppException(
        ErrorCode.EXTENSION_SESSION_INVALID,
        'Extension session context is required',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (body.deviceId !== session.deviceId) {
      await this.extensionSecurity.logSecurityError('EXT_SEC_DEVICE_MISMATCH', {
        sessionId: session.sessionId,
        bodyDeviceId: body.deviceId,
        tokenDeviceId: session.deviceId,
      });
      throw new AppException(
        ErrorCode.EXTENSION_DEVICE_MISMATCH,
        'Device mismatch',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const now = Date.now();
    if (body.ttlMs > extensionMaxTtlMs()) {
      await this.extensionSecurity.logSecurityError('EXT_SEC_TTL_TOO_LARGE', {
        sessionId: session.sessionId,
        ttlMs: body.ttlMs,
      });
      throw new AppException(
        ErrorCode.EXTENSION_TIMESTAMP_INVALID,
        'Request ttl is too large',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const expiresAtMs = body.timestampMs + body.ttlMs;
    if (
      now > expiresAtMs + extensionMaxClockSkewMs() ||
      now < body.timestampMs - extensionMaxClockSkewMs()
    ) {
      await this.extensionSecurity.logSecurityError(
        'EXT_SEC_TIMESTAMP_INVALID',
        {
          sessionId: session.sessionId,
          timestampMs: body.timestampMs,
          ttlMs: body.ttlMs,
        },
      );
      throw new AppException(
        ErrorCode.EXTENSION_TIMESTAMP_INVALID,
        'Request timestamp is invalid',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const extensionDevice = await this.prisma.extensionDevice.findUnique({
      where: {
        userId_deviceId: { userId: session.userId, deviceId: session.deviceId },
      },
    });
    if (!extensionDevice) {
      throw new AppException(
        ErrorCode.EXTENSION_DEVICE_MISMATCH,
        'Extension device is missing',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const message = signatureMessage({
      sessionId: session.sessionId,
      deviceId: body.deviceId,
      nonce: body.nonce,
      timestampMs: body.timestampMs,
      ttlMs: body.ttlMs,
      payload: body.payload,
    });
    const valid = verifySignature({
      publicKey: extensionDevice.publicKey,
      message,
      signatureBase64: body.signature,
    });
    if (!valid) {
      await this.extensionSecurity.logSecurityError(
        'EXT_SEC_SIGNATURE_INVALID',
        {
          sessionId: session.sessionId,
          nonce: body.nonce,
        },
      );
      throw new AppException(
        ErrorCode.EXTENSION_SIGNATURE_INVALID,
        'Invalid extension signature',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      await this.prisma.extensionNonce.create({
        data: {
          sessionId: session.sessionId,
          nonce: body.nonce,
          expiresAt: new Date(expiresAtMs),
        },
      });
    } catch {
      await this.extensionSecurity.logSecurityError('EXT_SEC_REPLAY_DETECTED', {
        sessionId: session.sessionId,
        nonce: body.nonce,
      });
      throw new AppException(
        ErrorCode.EXTENSION_REPLAY_DETECTED,
        'Replay attempt detected',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return true;
  }
}
