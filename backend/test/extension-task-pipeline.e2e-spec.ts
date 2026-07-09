import { INestApplication } from '@nestjs/common';
import { TradeTaskExecutionPhase, TradeTaskStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { generateKeyPairSync, sign } from 'crypto';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';
import { signatureMessage } from '../src/extension/extension-signature.util';

describe('Extension task pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let api: ApiClient;
  const envBackup = {
    channel: process.env.ENABLE_EXTENSION_CHANNEL,
    pipeline: process.env.ENABLE_EXTENSION_TASK_PIPELINE,
    orchestrator: process.env.ENABLE_EXTENSION_OFFER_ORCHESTRATOR,
    rollout: process.env.ENABLE_EXTENSION_ROLLOUT,
    stage: process.env.EXTENSION_ROLLOUT_STAGE,
    reconcile: process.env.ENABLE_TRADE_REFERENCE_RECONCILE,
    tradeRef: process.env.ENABLE_EXTENSION_TRADE_REFERENCE,
  };

  beforeAll(async () => {
    process.env.ENABLE_EXTENSION_CHANNEL = 'true';
    process.env.ENABLE_EXTENSION_TASK_PIPELINE = 'true';
    process.env.ENABLE_EXTENSION_OFFER_ORCHESTRATOR = 'true';
    process.env.ENABLE_EXTENSION_TRADE_REFERENCE = 'true';
    process.env.ENABLE_TRADE_REFERENCE_RECONCILE = 'true';
    process.env.ENABLE_EXTENSION_ROLLOUT = 'true';
    process.env.EXTENSION_ROLLOUT_STAGE = 'internal';
    process.env.EXTENSION_ROLLOUT_KILL_SWITCH = 'false';
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const sellerUser = await prisma.user.findFirst({ where: { role: UserRole.SELLER } });
    if (sellerUser) {
      process.env.EXTENSION_ROLLOUT_INTERNAL_USER_IDS = sellerUser.id;
    }
  });

  afterAll(async () => {
    if (envBackup.channel === undefined) {
      delete process.env.ENABLE_EXTENSION_CHANNEL;
    } else {
      process.env.ENABLE_EXTENSION_CHANNEL = envBackup.channel;
    }
    if (envBackup.pipeline === undefined) {
      delete process.env.ENABLE_EXTENSION_TASK_PIPELINE;
    } else {
      process.env.ENABLE_EXTENSION_TASK_PIPELINE = envBackup.pipeline;
    }
    if (envBackup.orchestrator === undefined) {
      delete process.env.ENABLE_EXTENSION_OFFER_ORCHESTRATOR;
    } else {
      process.env.ENABLE_EXTENSION_OFFER_ORCHESTRATOR = envBackup.orchestrator;
    }
    if (envBackup.rollout === undefined) {
      delete process.env.ENABLE_EXTENSION_ROLLOUT;
    } else {
      process.env.ENABLE_EXTENSION_ROLLOUT = envBackup.rollout;
    }
    if (envBackup.stage === undefined) {
      delete process.env.EXTENSION_ROLLOUT_STAGE;
    } else {
      process.env.EXTENSION_ROLLOUT_STAGE = envBackup.stage;
    }
    if (envBackup.reconcile === undefined) {
      delete process.env.ENABLE_TRADE_REFERENCE_RECONCILE;
    } else {
      process.env.ENABLE_TRADE_REFERENCE_RECONCILE = envBackup.reconcile;
    }
    if (envBackup.tradeRef === undefined) {
      delete process.env.ENABLE_EXTENSION_TRADE_REFERENCE;
    } else {
      process.env.ENABLE_EXTENSION_TRADE_REFERENCE = envBackup.tradeRef;
    }
    delete process.env.EXTENSION_ROLLOUT_INTERNAL_USER_IDS;
    await app.close();
  });

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
        publicKey: publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
      })
      .expect(201);

    return {
      deviceId,
      privateKey,
      sessionId: handshake.body.sessionId as string,
      accessToken: handshake.body.accessToken as string,
    };
  }

  function signedEnvelope(params: {
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
      signature: '',
    };
    const message = signatureMessage({
      sessionId: params.sessionId,
      deviceId: params.deviceId,
      nonce,
      timestampMs,
      ttlMs: envelope.ttlMs,
      payload: params.payload,
    });
    envelope.signature = sign('RSA-SHA256', Buffer.from(message, 'utf8'), params.privateKey)
      .toString('base64');
    return envelope;
  }

  it('creates trade task on buy, poll returns it, progress OFFER_SENT sets externalOfferId', async () => {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);
    await prisma.user.update({
      where: { id: buyer.userId },
      data: {
        tradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=test-token',
      },
    });
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    const lot = await api.createLot(seller, assetId, 100_000);
    await api.deposit(buyer, 250_000, `dep-${Date.now()}`);
    const order = await api.createOrder(buyer, lot.body.id, `buy-${Date.now()}`);
    const orderId = order.body.id as string;

    const task = await prisma.tradeTask.findFirst({ where: { orderId } });
    expect(task).toBeTruthy();
    expect(task?.type).toBe('create_offer');

    const ext = await extensionSessionFor(seller.token);
    const poll = await request(app.getHttpServer())
      .post('/api/v1/extension/tasks/poll')
      .set('Authorization', `Bearer ${ext.accessToken}`)
      .send(
        signedEnvelope({
          sessionId: ext.sessionId,
          deviceId: ext.deviceId,
          privateKey: ext.privateKey,
          payload: { limit: 5 },
        }),
      )
      .expect(200);

    expect(poll.body.tasks).toHaveLength(1);
    const taskId = poll.body.tasks[0].id as string;

    const progress = await request(app.getHttpServer())
      .post('/api/v1/extension/tasks/progress')
      .set('Authorization', `Bearer ${ext.accessToken}`)
      .send(
        signedEnvelope({
          sessionId: ext.sessionId,
          deviceId: ext.deviceId,
          privateKey: ext.privateKey,
          payload: {
            taskId,
            phase: TradeTaskExecutionPhase.OFFER_SENT,
            idempotencyKey: `progress:${taskId}:OFFER_SENT`,
            offerId: '99887766',
          },
        }),
      )
      .expect(200);

    expect(progress.body.terminal).toBe(true);

    const tradeOperation = await prisma.tradeOperation.findFirst({
      where: { orderId },
    });
    expect(tradeOperation?.externalOfferId).toBe('99887766');

    const updatedTask = await prisma.tradeTask.findUnique({ where: { id: taskId } });
    expect(updatedTask?.status).toBe(TradeTaskStatus.ACKED);
    expect(updatedTask?.executionPhase).toBe(TradeTaskExecutionPhase.OFFER_SENT);
  });

  it('CONFIRM_PENDING with valid offer id can be followed by OFFER_SENT reconcile', async () => {
    const seller = await api.login(UserRole.SELLER);
    const buyer = await api.login(UserRole.BUYER);
    await prisma.user.update({
      where: { id: buyer.userId },
      data: {
        tradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=test-token',
      },
    });
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    const lot = await api.createLot(seller, assetId, 100_000);
    await api.deposit(buyer, 250_000, `dep-guard-${Date.now()}`);
    const order = await api.createOrder(buyer, lot.body.id, `buy-guard-${Date.now()}`);
    const orderId = order.body.id as string;
    const task = await prisma.tradeTask.findFirst({ where: { orderId } });
    const taskId = task!.id;
    const ext = await extensionSessionFor(seller.token);

    await request(app.getHttpServer())
      .post('/api/v1/extension/tasks/progress')
      .set('Authorization', `Bearer ${ext.accessToken}`)
      .send(
        signedEnvelope({
          sessionId: ext.sessionId,
          deviceId: ext.deviceId,
          privateKey: ext.privateKey,
          payload: {
            taskId,
            phase: TradeTaskExecutionPhase.CONFIRM_PENDING,
            idempotencyKey: `progress:${taskId}:CONFIRM_PENDING`,
            reasonCode: 'CONFIRM_PENDING',
            offerId: '88776655',
            details: { offerId: '88776655' },
          },
        }),
      )
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/extension/tasks/progress')
      .set('Authorization', `Bearer ${ext.accessToken}`)
      .send(
        signedEnvelope({
          sessionId: ext.sessionId,
          deviceId: ext.deviceId,
          privateKey: ext.privateKey,
          payload: {
            taskId,
            phase: TradeTaskExecutionPhase.OFFER_SENT,
            idempotencyKey: `progress:${taskId}:OFFER_SENT`,
            offerId: '88776655',
          },
        }),
      )
      .expect(200);

    const tradeOperation = await prisma.tradeOperation.findFirst({
      where: { orderId },
    });
    expect(tradeOperation?.externalOfferId).toBe('88776655');
  });
});
