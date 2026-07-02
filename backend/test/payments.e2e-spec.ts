import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/errors/global-exception.filter';
import { OutboxProcessorService } from '../src/outbox/outbox-processor.service';
import { PAYMENT_PROVIDER } from '../src/providers/tokens';
import { PrismaService } from '../src/prisma/prisma.service';
import { signGatewayWebhook } from '../src/providers/payment/payment.util';
import { ApiClient } from './helpers/api-client';
import { resetDatabase } from './helpers/reset-database';
import { TestCryptoPaymentProvider } from './helpers/test-crypto-payment.provider';

const WEBHOOK_SECRET = 'e2e-webhook-secret';

describe('Payments crypto flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let api: ApiClient;
  let testProvider: TestCryptoPaymentProvider;

  beforeAll(async () => {
    process.env.PAYMENT_PROVIDER = 'crypto_tron';
    process.env.ENABLE_MOCK_DEPOSIT = 'false';
    process.env.CRYPTO_GATEWAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.MIN_DEPOSIT_MINOR = '100';
    process.env.MIN_WITHDRAW_MINOR = '500';
    process.env.WITHDRAW_FEE_MINOR = '100';
    process.env.WITHDRAW_MANUAL_REVIEW = 'true';
    process.env.WITHDRAW_MANUAL_REVIEW_COUNT = '5';
    process.env.WITHDRAW_REQUIRE_STEAM_LINKED = 'true';
    process.env.WITHDRAW_DAILY_CAP_MINOR = '1000000';

    testProvider = new TestCryptoPaymentProvider(WEBHOOK_SECRET);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(testProvider)
      .overrideProvider(OutboxProcessorService)
      .useValue({
        processPending: async () => ({ processed: 0, failed: 0 }),
        handleInterval: async () => undefined,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    api = new ApiClient(app);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginWithSteam(role: UserRole) {
    const session = await api.login(role);
    await prisma.user.update({
      where: { id: session.userId },
      data: { steamId: `76561198${role === UserRole.SELLER ? '111111111' : '222222222'}` },
    });
    return session;
  }

  it('deposit webhook increases available balance', async () => {
    const buyer = await loginWithSteam(UserRole.BUYER);

    const depositInfo = await request(app.getHttpServer())
      .get('/api/v1/wallet/deposit')
      .set('Authorization', `Bearer ${buyer.token}`);
    expect(depositInfo.status).toBe(200);
    expect(depositInfo.body.address).toBeTruthy();

    const payload = {
      eventId: 'e2e-dep-1',
      type: 'deposit.credited' as const,
      externalUserId: buyer.userId,
      txHash: 'e2e-tx-hash-1',
      amountSun: '1000000',
      address: depositInfo.body.address,
      creditedAt: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);
    const signature = signGatewayWebhook(WEBHOOK_SECRET, body);

    const webhook = await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/crypto')
      .set('X-Gateway-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect([200, 201]).toContain(webhook.status);

    testProvider.recordCreditedPayment(buyer.userId, {
      txHash: payload.txHash,
      amountSun: payload.amountSun,
      status: 'credited',
    });

    const wallet = await api.getWallet(buyer);
    const available = Number(
      wallet.body.accounts.find((a: { type: string }) => a.type === 'AVAILABLE')
        .balanceMinor,
    );
    expect(available).toBe(100);
  });

  it('full flow: deposit → buy → settle → withdraw request', async () => {
    const seller = await loginWithSteam(UserRole.SELLER);
    const buyer = await loginWithSteam(UserRole.BUYER);
    const priceMinor = 50_000;

    const inventory = await api.getInventory(seller);
    const lot = await api.createLot(seller, inventory.body.assets[0].id, priceMinor);

    const depositPayload = {
      eventId: 'e2e-dep-2',
      type: 'deposit.credited' as const,
      externalUserId: buyer.userId,
      txHash: 'e2e-tx-hash-2',
      amountSun: String(priceMinor * 2 * 10_000),
      address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
      creditedAt: new Date().toISOString(),
    };
    const depositBody = JSON.stringify(depositPayload);
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhooks/crypto')
      .set('X-Gateway-Signature', signGatewayWebhook(WEBHOOK_SECRET, depositBody))
      .send(depositPayload);

    const order = await api.createOrder(buyer, lot.body.id, 'e2e-order-1');
    expect([200, 201]).toContain(order.status);

    const trade = await api.mockSuccess(buyer, order.body.id, 'e2e-trade-success-1');
    expect([200, 201]).toContain(trade.status);
    expect(trade.body.status).toBe('COMPLETED');

    const sellerWallet = await api.getWallet(seller);
    const sellerAvailable = Number(
      sellerWallet.body.accounts.find((a: { type: string }) => a.type === 'AVAILABLE')
        .balanceMinor,
    );
    expect(sellerAvailable).toBe(Math.floor(priceMinor * 0.95));

    const withdrawal = await request(app.getHttpServer())
      .post('/api/v1/wallet/withdrawals')
      .set('Authorization', `Bearer ${seller.token}`)
      .set('Idempotency-Key', 'e2e-withdraw-1')
      .send({
        toAddress: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        amountMinor: 2000,
      });

    expect([200, 201]).toContain(withdrawal.status);
    expect(withdrawal.body.status).toBe('PENDING_REVIEW');
  });

  it('mock deposit is forbidden when disabled', async () => {
    const buyer = await loginWithSteam(UserRole.BUYER);

    const response = await request(app.getHttpServer())
      .post('/api/v1/wallet/mock-deposit')
      .set('Authorization', `Bearer ${buyer.token}`)
      .set('Idempotency-Key', 'mock-dep-blocked')
      .send({ amountMinor: 1000 });

    expect(response.status).toBe(403);
  });
});
