import * as steamHttp from '../src/common/steam/steam-http.client';
import type { InventoryBaseline } from '../src/trades/inventory-observation';
import { INestApplication } from '@nestjs/common';
import {
  TradeTaskExecutionPhase,
  TradeTaskStatus,
  UserRole,
} from '@prisma/client';
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
  });

  async function loginRolloutSeller() {
    const seller = await api.login(UserRole.SELLER);
    process.env.EXTENSION_ROLLOUT_INTERNAL_USER_IDS = seller.userId;
    return seller;
  }

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
      ttlMs: 5_000,
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
    envelope.signature = sign(
      'RSA-SHA256',
      Buffer.from(message, 'utf8'),
      params.privateKey,
    ).toString('base64');
    return envelope;
  }

  async function prepareOrderBeforeDispatch(
    ext: Awaited<ReturnType<typeof extensionSessionFor>>,
    orderId: string,
  ) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { seller: true, buyer: true, tradeOperation: true },
    });
    expect(order.buyer.steamId).toBe('76561198083722517');
    const paths: string[] = [];
    const started = Date.now();
    const upstream = jest
      .spyOn(steamHttp, 'steamFetch')
      .mockImplementation(async (input) => {
        const url = new URL(String(input));
        expect(url.origin).toBe('https://steamcommunity.com');
        const match = /^\/inventory\/([0-9]+)\/730\/(2|16)$/.exec(url.pathname);
        expect(match).not.toBeNull();
        const [, steamId, contextId] = match!;
        expect([order.seller.steamId, order.buyer.steamId]).toContain(steamId);
        paths.push(url.pathname);
        const assetid =
          steamId === order.seller.steamId && contextId === '2'
            ? order.tradeOperation!.expectedAssetId!
            : (steamId === order.seller.steamId ? '800' : '900') + contextId;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: 1,
            more_items: 0,
            assets: [
              {
                appid: 730,
                contextid: contextId,
                assetid,
                classid: '123',
                instanceid: '0',
              },
            ],
            descriptions: [
              {
                classid: '123',
                instanceid: '0',
                market_hash_name: 'Fixture skin',
              },
            ],
            asset_properties: [
              {
                appid: 730,
                contextid: contextId,
                assetid,
                asset_properties: [
                  { propertyid: 1, float_value: '0.5' },
                  { propertyid: 2, int_value: '42' },
                ],
              },
            ],
          }),
        } as never;
      });
    try {
      expect(order.tradeOperation!.inventoryBaseline).toBeNull();
      const waiting = await request(app.getHttpServer())
        .post('/api/v1/extension/tasks/poll')
        .set('Authorization', `Bearer ${ext.accessToken}`)
        .send(
          signedEnvelope({
            ...ext,
            nonce: 'before-' + orderId,
            payload: { limit: 5 },
          }),
        )
        .expect(200);
      expect(waiting.body.tasks).toHaveLength(0);
      expect(upstream).not.toHaveBeenCalled();
      const prepared = await request(app.getHttpServer())
        .post('/api/v1/extension/steam-order-verification/preflight')
        .set('Authorization', `Bearer ${ext.accessToken}`)
        .send(
          signedEnvelope({
            ...ext,
            nonce: 'prepare-' + orderId,
            payload: { orderId },
          }),
        )
        .expect(201);
      expect(prepared.body).toMatchObject({
        allowed: true,
        baselineReady: true,
        waitingForOffer: true,
      });
      expect(paths.sort()).toEqual(
        [order.seller.steamId, order.buyer.steamId]
          .flatMap((id) =>
            ['2', '16'].map((ctx) => `/inventory/${id}/730/${ctx}`),
          )
          .sort(),
      );
      const saved = await prisma.tradeOperation.findUniqueOrThrow({
        where: { orderId },
      });
      const baseline = saved.inventoryBaseline as unknown as InventoryBaseline;
      expect(baseline.original).toMatchObject({
        assetId: order.tradeOperation!.expectedAssetId,
        contextId: '2',
        appId: 730,
        floatValue: '0.5',
        paintSeed: 42,
      });
      for (const snapshot of [baseline.seller, baseline.buyer]) {
        expect(snapshot.assets.map((item) => item.contextId).sort()).toEqual([
          '16',
          '2',
        ]);
        expect(Date.parse(snapshot.fetchedAt)).toBeGreaterThanOrEqual(started);
        expect(Date.parse(snapshot.fetchedAt)).toBeLessThanOrEqual(Date.now());
      }
      expect(baseline.buyer.assets.map((item) => item.assetId).sort()).toEqual([
        '90016',
        '9002',
      ]);
      expect(await prisma.steamMappingLease.count({ where: { orderId } })).toBe(
        2,
      );
      expect(saved.tradeBinding).toMatch(/^p2pcs:/);
    } finally {
      upstream.mockRestore();
    }
  }

  it('creates trade task on buy, poll returns it, progress OFFER_SENT sets externalOfferId', async () => {
    const seller = await loginRolloutSeller();
    const buyer = await api.login(UserRole.BUYER);
    await prisma.user.update({
      where: { id: buyer.userId },
      data: {
        steamId: '76561198083722517',
        tradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=test-token',
      },
    });
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    await prisma.inventoryAsset.update({
      where: { id: assetId },
      data: { assetExternalId: '50586848789' },
    });
    const lot = await api.createLot(seller, assetId, 100_000);
    await api.deposit(buyer, 250_000, `dep-${Date.now()}`);
    const order = await api.createOrder(
      buyer,
      lot.body.id,
      `buy-${Date.now()}`,
    );
    const orderId = order.body.id as string;

    const task = await prisma.tradeTask.findFirst({ where: { orderId } });
    expect(task).toBeTruthy();
    expect(task?.type).toBe('create_offer');

    const ext = await extensionSessionFor(seller.token);
    await prepareOrderBeforeDispatch(ext, orderId);
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

    const updatedTask = await prisma.tradeTask.findUnique({
      where: { id: taskId },
    });
    expect(updatedTask?.status).toBe(TradeTaskStatus.ACKED);
    expect(updatedTask?.executionPhase).toBe(
      TradeTaskExecutionPhase.OFFER_SENT,
    );
  });

  it('CONFIRM_PENDING with valid offer id can be followed by OFFER_SENT reconcile', async () => {
    const seller = await loginRolloutSeller();
    const buyer = await api.login(UserRole.BUYER);
    await prisma.user.update({
      where: { id: buyer.userId },
      data: {
        steamId: '76561198083722517',
        tradeUrl:
          'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=test-token',
      },
    });
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    await prisma.inventoryAsset.update({
      where: { id: assetId },
      data: { assetExternalId: '50586848789' },
    });
    const lot = await api.createLot(seller, assetId, 100_000);
    await api.deposit(buyer, 250_000, `dep-guard-${Date.now()}`);
    const order = await api.createOrder(
      buyer,
      lot.body.id,
      `buy-guard-${Date.now()}`,
    );
    const orderId = order.body.id as string;
    const task = await prisma.tradeTask.findFirst({ where: { orderId } });
    const taskId = task!.id;
    const ext = await extensionSessionFor(seller.token);
    await prepareOrderBeforeDispatch(ext, orderId);
    const poll = await request(app.getHttpServer())
      .post('/api/v1/extension/tasks/poll')
      .set('Authorization', `Bearer ${ext.accessToken}`)
      .send(
        signedEnvelope({
          sessionId: ext.sessionId,
          deviceId: ext.deviceId,
          privateKey: ext.privateKey,
          payload: {},
        }),
      )
      .expect(200);
    const leased = poll.body.tasks.find(
      (entry: { id: string }) => entry.id === taskId,
    );
    expect(leased).toBeTruthy();

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
            leaseVersion: leased.leaseVersion,
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
            leaseVersion: leased.leaseVersion,
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
  it.each(['missing-buyer', 'context16-failure'] as const)(
    'preflight %s never authorizes dispatch or persists an incomplete baseline',
    async (failure) => {
      const seller = await loginRolloutSeller();
      const buyer = await api.login(UserRole.BUYER);
      await prisma.user.update({
        where: { id: buyer.userId },
        data: {
          steamId: failure === 'missing-buyer' ? null : '76561198083722517',
          tradeUrl:
            'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=test-token',
        },
      });
      const inventory = await api.getInventory(seller);
      const assetId = inventory.body.assets[0].id as string;
      await prisma.inventoryAsset.update({
        where: { id: assetId },
        data: { assetExternalId: '50586848789' },
      });
      const lot = await api.createLot(seller, assetId, 100000);
      await api.deposit(buyer, 250000, 'negative-deposit');
      const order = await api.createOrder(buyer, lot.body.id, 'negative-order');
      const orderId = order.body.id as string;
      const ext = await extensionSessionFor(seller.token);
      const paths: string[] = [];
      const upstream = jest
        .spyOn(steamHttp, 'steamFetch')
        .mockImplementation(async (input) => {
          const url = new URL(String(input));
          paths.push(url.pathname);
          if (url.pathname.endsWith('/16'))
            return { ok: false, status: 403, json: async () => ({}) } as never;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: 1,
              more_items: 0,
              assets: [
                {
                  appid: 730,
                  contextid: '2',
                  assetid: '50586848789',
                  classid: '123',
                  instanceid: '0',
                },
              ],
              descriptions: [
                {
                  classid: '123',
                  instanceid: '0',
                  market_hash_name: 'Fixture skin',
                },
              ],
            }),
          } as never;
        });
      try {
        const result = await request(app.getHttpServer())
          .post('/api/v1/extension/steam-order-verification/preflight')
          .set('Authorization', `Bearer ${ext.accessToken}`)
          .send(
            signedEnvelope({
              ...ext,
              nonce: 'negative-preflight',
              payload: { orderId },
            }),
          )
          .expect(201);
        expect(result.body).toMatchObject({
          allowed: false,
          baselineReady: false,
          reasonCode: 'BEFORE_BASELINE_NOT_READY',
        });
        const saved = await prisma.tradeOperation.findUniqueOrThrow({
          where: { orderId },
        });
        expect(saved.inventoryBaseline).toBeNull();
        expect(saved.tradeBinding).toBeNull();
        if (failure === 'missing-buyer')
          expect(upstream).not.toHaveBeenCalled();
        else
          expect(paths).toEqual([
            `/inventory/76561198000000000/730/2`,
            `/inventory/76561198000000000/730/16`,
          ]);
        const poll = await request(app.getHttpServer())
          .post('/api/v1/extension/tasks/poll')
          .set('Authorization', `Bearer ${ext.accessToken}`)
          .send(
            signedEnvelope({
              ...ext,
              nonce: 'negative-poll',
              payload: { limit: 5 },
            }),
          )
          .expect(200);
        expect(poll.body.tasks).toHaveLength(0);
        expect(
          await prisma.steamMappingLease.count({ where: { orderId } }),
        ).toBe(0);
      } finally {
        upstream.mockRestore();
      }
    },
  );
});
