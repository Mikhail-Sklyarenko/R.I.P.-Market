import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { generateKeyPairSync, sign } from 'crypto';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { ApiClient } from './helpers/api-client';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDatabase } from './helpers/reset-database';
import { signatureMessage } from '../src/extension/extension-signature.util';

describe('Extension channel smoke (e2e)', () => {
  let app: INestApplication<App>;
  let api: ApiClient;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.ENABLE_EXTENSION_CHANNEL = 'true';
    app = await createE2eApp();
    api = new ApiClient(app);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    delete process.env.ENABLE_EXTENSION_CHANNEL;
    await app.close();
  });

  it('handshake + signed heartbeat', async () => {
    const buyer = await api.login(UserRole.BUYER);
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const deviceId = 'ext-device-1';

    const handshake = await request(app.getHttpServer())
      .post('/api/v1/extension/handshake')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        deviceId,
        publicKey: publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
      });
    expect(handshake.status).toBe(201);

    const sessionId = handshake.body.sessionId as string;
    const accessToken = handshake.body.accessToken as string;
    const timestampMs = Date.now();
    const payload = { ping: true };
    const message = signatureMessage({
      sessionId,
      deviceId,
      nonce: 'heartbeat-nonce-1',
      timestampMs,
      ttlMs: 5000,
      payload,
    });
    const signature = sign('RSA-SHA256', Buffer.from(message, 'utf8'), privateKey)
      .toString('base64');

    const heartbeat = await request(app.getHttpServer())
      .post('/api/v1/extension/heartbeat')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        deviceId,
        nonce: 'heartbeat-nonce-1',
        timestampMs,
        ttlMs: 5000,
        payload,
        signature,
      });
    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.ok).toBe(true);
  });
});
