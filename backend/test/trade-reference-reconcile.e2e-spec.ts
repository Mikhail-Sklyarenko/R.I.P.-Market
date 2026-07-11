import { INestApplication } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { generateKeyPairSync, sign } from 'crypto';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';
import { signatureMessage } from '../src/extension/extension-signature.util';

describe('Trade reference reconcile (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let api: ApiClient;
  const envBackup = {
    reconcile: process.env.ENABLE_TRADE_REFERENCE_RECONCILE,
    extensionRef: process.env.ENABLE_EXTENSION_TRADE_REFERENCE,
    extensionChannel: process.env.ENABLE_EXTENSION_CHANNEL,
  };

  beforeAll(async () => {
    process.env.ENABLE_TRADE_REFERENCE_RECONCILE = 'true';
    process.env.ENABLE_EXTENSION_TRADE_REFERENCE = 'true';
    process.env.ENABLE_EXTENSION_CHANNEL = 'true';
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    if (envBackup.reconcile === undefined) {
      delete process.env.ENABLE_TRADE_REFERENCE_RECONCILE;
    } else {
      process.env.ENABLE_TRADE_REFERENCE_RECONCILE = envBackup.reconcile;
    }
    if (envBackup.extensionRef === undefined) {
      delete process.env.ENABLE_EXTENSION_TRADE_REFERENCE;
    } else {
      process.env.ENABLE_EXTENSION_TRADE_REFERENCE = envBackup.extensionRef;
    }
    if (envBackup.extensionChannel === undefined) {
      delete process.env.ENABLE_EXTENSION_CHANNEL;
    } else {
      process.env.ENABLE_EXTENSION_CHANNEL = envBackup.extensionChannel;
    }
    await app.close();
  });

  async function createWaitingTradeOrder(suffix: string) {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    const lot = await api.createLot(seller, assetId, 100_000);
    await api.deposit(buyer, 250_000, `dep-${suffix}`);
    const order = await api.createOrder(buyer, lot.body.id, `buy-${suffix}`);
    return { seller, buyer, orderId: order.body.id as string };
  }

  async function extensionSessionFor(userToken: string) {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const deviceId = `device-${Date.now()}`;
    const handshake = await request(app.getHttpServer())
      .post('/api/v1/extension/handshake')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        deviceId,
        publicKey: publicKey
          .export({ type: 'pkcs1', format: 'pem' })
          .toString(),
      })
      .expect(201);

    return {
      deviceId,
      privateKey,
      sessionId: handshake.body.sessionId as string,
      accessToken: handshake.body.accessToken as string,
    };
  }

  function signedBody(params: {
    sessionId: string;
    deviceId: string;
    privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
    payload: Record<string, unknown>;
    nonce?: string;
  }) {
    const timestampMs = Date.now();
    const nonce = params.nonce ?? `nonce-${Date.now()}`;
    const envelope = {
      deviceId: params.deviceId,
      nonce,
      timestampMs,
      ttlMs: 30_000,
      payload: params.payload,
    };
    const message = signatureMessage({
      sessionId: params.sessionId,
      deviceId: params.deviceId,
      nonce,
      timestampMs,
      ttlMs: 30_000,
      payload: params.payload,
    });
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(message, 'utf8'),
      params.privateKey,
    ).toString('base64');
    return { ...envelope, signature };
  }

  it('accepts valid manual trade reference and audit log', async () => {
    const { seller, orderId } = await createWaitingTradeOrder('valid');

    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/trade-reference`)
      .set('Authorization', `Bearer ${seller.token}`)
      .set('Idempotency-Key', 'manual-valid-1')
      .send({ offerId: '8301234567' })
      .expect(200);

    const operation = await prisma.tradeOperation.findFirst({
      where: { orderId },
    });
    expect(operation?.externalOfferId).toBe('8301234567');

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityId: orderId,
        action: 'TRADE_REFERENCE_RECONCILED',
        idempotencyKey: 'manual-valid-1',
      },
    });
    expect(audit).toBeTruthy();
  });

  it('is idempotent for duplicate manual submission', async () => {
    const { seller, orderId } = await createWaitingTradeOrder('dup');

    for (let i = 0; i < 2; i += 1) {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/trade-reference`)
        .set('Authorization', `Bearer ${seller.token}`)
        .set('Idempotency-Key', 'manual-dup-1')
        .send({ offerId: '8307654321' })
        .expect(200);
    }

    const audits = await prisma.auditLog.findMany({
      where: {
        entityId: orderId,
        action: 'TRADE_REFERENCE_RECONCILED',
        idempotencyKey: 'manual-dup-1',
      },
    });
    expect(audits).toHaveLength(1);
  });

  it('opens dispute on spoofed offer id linked to another order', async () => {
    const first = await createWaitingTradeOrder('spoof-a');
    const second = await createWaitingTradeOrder('spoof-b');

    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${first.orderId}/trade-reference`)
      .set('Authorization', `Bearer ${first.seller.token}`)
      .set('Idempotency-Key', 'spoof-first')
      .send({ offerId: '8308888888' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${second.orderId}/trade-reference`)
      .set('Authorization', `Bearer ${second.seller.token}`)
      .set('Idempotency-Key', 'spoof-second')
      .send({ offerId: '8308888888' })
      .expect(200);

    const disputed = await prisma.order.findUnique({
      where: { id: second.orderId },
      include: { tradeOperation: true },
    });
    expect(disputed?.status).toBe(OrderStatus.DISPUTE);
    expect(disputed?.tradeOperation?.failReasonCode).toBe(
      'TRADE_REFERENCE_SPOOF',
    );
  });

  it('opens dispute when replacing offer id on same order', async () => {
    const { seller, orderId } = await createWaitingTradeOrder('mismatch');

    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/trade-reference`)
      .set('Authorization', `Bearer ${seller.token}`)
      .set('Idempotency-Key', 'mismatch-1')
      .send({ offerId: '8301111111' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/trade-reference`)
      .set('Authorization', `Bearer ${seller.token}`)
      .set('Idempotency-Key', 'mismatch-2')
      .send({ offerId: '8302222222' })
      .expect(200);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { tradeOperation: true },
    });
    expect(order?.status).toBe(OrderStatus.DISPUTE);
    expect(order?.tradeOperation?.failReasonCode).toBe(
      'TRADE_REFERENCE_MISMATCH',
    );
  });

  it('accepts extension signed trade reference', async () => {
    const { seller, orderId } = await createWaitingTradeOrder('ext');
    const ext = await extensionSessionFor(seller.token);
    const body = signedBody({
      sessionId: ext.sessionId,
      deviceId: ext.deviceId,
      privateKey: ext.privateKey,
      payload: {
        orderId,
        idempotencyKey: 'ext-ref-1',
        tradeUrl: 'https://steamcommunity.com/tradeoffer/8303333333/',
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/extension/orders/${orderId}/trade-reference`)
      .set('Authorization', `Bearer ${ext.accessToken}`)
      .send(body)
      .expect(200);

    expect(response.body.externalOfferId).toBe('8303333333');
    expect(response.body.applied).toBe(true);
  });
});
