import { Injectable, Logger } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { AntiFraudRuleService } from '../common/observability/anti-fraud.service';
import { ExtensionFlowMetricsService } from '../common/observability/extension-flow-metrics.service';
import {
  extensionTokenSecret,
  extensionTokenTtlSeconds,
} from './extension-channel.config';

type ExtensionTokenPayload = {
  sub: string;
  sid: string;
  did: string;
  jti: string;
  typ: 'extension';
};

@Injectable()
export class ExtensionSecurityService {
  private readonly logger = new Logger(ExtensionSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly extensionFlowMetrics: ExtensionFlowMetricsService,
    private readonly antiFraud: AntiFraudRuleService,
  ) {}

  async handshake(userId: string, deviceId: string, publicKey: string) {
    const now = new Date();
    const ttlSeconds = extensionTokenTtlSeconds();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const sessionId = randomUUID();
    const jti = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.extensionDevice.upsert({
        where: { userId_deviceId: { userId, deviceId } },
        create: { userId, deviceId, publicKey },
        update: {
          publicKey,
          status: 'ACTIVE',
          lastSeenAt: now,
        },
      });
      await tx.extensionSession.create({
        data: {
          id: sessionId,
          userId,
          deviceId,
          tokenJti: jti,
          status: 'ACTIVE',
          expiresAt,
        },
      });
    });

    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId, did: deviceId, jti, typ: 'extension' },
      { secret: extensionTokenSecret(), expiresIn: `${ttlSeconds}s` },
    );

    return {
      sessionId,
      deviceId,
      accessToken,
      expiresAt: expiresAt.toISOString(),
      tokenType: 'Bearer',
    };
  }

  async validateExtensionToken(token: string): Promise<{
    sessionId: string;
    userId: string;
    deviceId: string;
    tokenJti: string;
  }> {
    let payload: ExtensionTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<ExtensionTokenPayload>(token, {
        secret: extensionTokenSecret(),
      });
    } catch {
      await this.logSecurityError('EXT_SEC_TOKEN_EXPIRED', {
        reason: 'jwt_verify_failed',
      });
      throw new AppException(
        ErrorCode.EXTENSION_TOKEN_EXPIRED,
        'Extension token is invalid or expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (payload.typ !== 'extension') {
      await this.logSecurityError('EXT_SEC_TOKEN_INVALID', { reason: 'bad_typ' });
      throw new AppException(
        ErrorCode.EXTENSION_SESSION_INVALID,
        'Invalid extension token type',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const session = await this.prisma.extensionSession.findUnique({
      where: { id: payload.sid },
      include: { device: true },
    });
    if (!session || session.tokenJti !== payload.jti || session.userId !== payload.sub) {
      await this.logSecurityError('EXT_SEC_SESSION_INVALID', {
        sid: payload.sid,
        jti: payload.jti,
        userId: payload.sub,
      });
      throw new AppException(
        ErrorCode.EXTENSION_SESSION_INVALID,
        'Extension session is invalid',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (session.status === 'REVOKED' || session.revokedAt) {
      await this.logSecurityError('EXT_SEC_SESSION_REVOKED', {
        sid: payload.sid,
        userId: session.userId,
      });
      throw new AppException(
        ErrorCode.EXTENSION_SESSION_REVOKED,
        'Extension session is revoked',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.extensionSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      await this.logSecurityError('EXT_SEC_TOKEN_EXPIRED', {
        sid: payload.sid,
        userId: session.userId,
      });
      throw new AppException(
        ErrorCode.EXTENSION_TOKEN_EXPIRED,
        'Extension token is expired',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (session.device.status !== 'ACTIVE') {
      await this.logSecurityError('EXT_SEC_DEVICE_REVOKED', {
        sid: payload.sid,
        did: payload.did,
        userId: session.userId,
      });
      throw new AppException(
        ErrorCode.EXTENSION_DEVICE_MISMATCH,
        'Extension device is not active',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      deviceId: session.deviceId,
      tokenJti: session.tokenJti,
    };
  }

  async rotateSession(currentSessionId: string): Promise<{
    sessionId: string;
    accessToken: string;
    expiresAt: string;
    tokenType: string;
  }> {
    const current = await this.prisma.extensionSession.findUnique({
      where: { id: currentSessionId },
    });
    if (!current || current.status !== 'ACTIVE') {
      throw new AppException(
        ErrorCode.EXTENSION_SESSION_INVALID,
        'Cannot rotate inactive extension session',
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    const ttlSeconds = extensionTokenTtlSeconds();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const newSessionId = randomUUID();
    const newJti = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.extensionSession.update({
        where: { id: current.id },
        data: {
          status: 'REVOKED',
          revokedAt: now,
        },
      });
      await tx.extensionSession.create({
        data: {
          id: newSessionId,
          userId: current.userId,
          deviceId: current.deviceId,
          tokenJti: newJti,
          status: 'ACTIVE',
          expiresAt,
          rotatedFromSessionId: current.id,
        },
      });
    });

    const accessToken = await this.jwt.signAsync(
      {
        sub: current.userId,
        sid: newSessionId,
        did: current.deviceId,
        jti: newJti,
        typ: 'extension',
      },
      { secret: extensionTokenSecret(), expiresIn: `${ttlSeconds}s` },
    );
    return {
      sessionId: newSessionId,
      accessToken,
      expiresAt: expiresAt.toISOString(),
      tokenType: 'Bearer',
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.extensionSession.update({
      where: { id: sessionId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  }

  async touchHeartbeat(sessionId: string): Promise<void> {
    const session = await this.prisma.extensionSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return;
    }
    await this.prisma.extensionDevice.update({
      where: { userId_deviceId: { userId: session.userId, deviceId: session.deviceId } },
      data: { lastSeenAt: new Date() },
    });
  }

  async logSecurityError(code: string, details: Record<string, unknown>): Promise<void> {
    const userId =
      typeof details.userId === 'string' ? details.userId : undefined;
    const sessionId =
      typeof details.sid === 'string'
        ? details.sid
        : typeof details.sessionId === 'string'
          ? details.sessionId
          : undefined;

    this.extensionFlowMetrics.recordAuthError({
      code,
      userId,
      sessionId,
    });
    if (userId) {
      this.antiFraud.recordAuthFailure(userId, code);
    }

    this.logger.warn(
      JSON.stringify({
        event: 'extension_security_error',
        metric: 'extension_security_error_total',
        alert: true,
        code,
        ...details,
      }),
    );
    await this.prisma.auditLog.create({
      data: {
        entityType: 'extension_session',
        entityId: String(details.sid ?? details.sessionId ?? 'unknown'),
        action: code,
        afterState: details as Prisma.InputJsonValue,
      },
    });
    await this.prisma.outboxEvent.create({
      data: {
        eventType: 'EXTENSION_SECURITY_ALERT',
        aggregateType: 'extension_session',
        aggregateId: String(details.sid ?? details.sessionId ?? 'unknown'),
        payload: {
          code,
          ...details,
        },
      },
    });
  }
}
