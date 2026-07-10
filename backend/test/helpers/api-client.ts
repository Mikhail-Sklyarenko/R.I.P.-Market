import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { LedgerService } from '../../src/wallet/ledger.service';

const MOCK_TRADE_URL =
  'https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEfGh';

type AuthSession = {
  token: string;
  userId: string;
};

export class ApiClient {
  constructor(private readonly app: INestApplication<App>) {}

  async login(role: UserRole): Promise<AuthSession> {
    const response = await request(this.app.getHttpServer())
      .post('/api/v1/auth/mock-login')
      .send({ role });

    expect([200, 201]).toContain(response.status);

    const session = {
      token: response.body.accessToken,
      userId: response.body.user.id,
    };

    if (
      process.env.INVENTORY_PROVIDER === 'steam' &&
      role === UserRole.SELLER
    ) {
      const prisma = this.app.get(PrismaService);
      await prisma.user.update({
        where: { id: session.userId },
        data: { steamId: '76561198000000000' },
      });
    }

    await request(this.app.getHttpServer())
      .patch('/api/v1/users/me/trade-url')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ tradeUrl: MOCK_TRADE_URL });

    return session;
  }

  async createBuyerSession(suffix: string): Promise<AuthSession> {
    const prisma = this.app.get(PrismaService);
    const ledger = this.app.get(LedgerService);
    const jwt = this.app.get(JwtService);

    const user = await prisma.user.create({
      data: {
        username: `buyer_${suffix}`,
        steamId: `steam_buyer_${suffix}`,
        role: UserRole.BUYER,
        status: UserStatus.ACTIVE,
      },
    });
    await ledger.ensureUserWallet(user.id);

    const token = await jwt.signAsync({ sub: user.id, role: UserRole.BUYER });
    const session = { token, userId: user.id };

    await request(this.app.getHttpServer())
      .patch('/api/v1/users/me/trade-url')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ tradeUrl: MOCK_TRADE_URL });

    return session;
  }

  async deposit(
    session: AuthSession,
    amountMinor: number,
    idempotencyKey: string,
  ) {
    return request(this.app.getHttpServer())
      .post('/api/v1/wallet/mock-deposit')
      .set('Authorization', `Bearer ${session.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ amountMinor });
  }

  async getInventory(session: AuthSession) {
    return request(this.app.getHttpServer())
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${session.token}`);
  }

  async createLot(
    session: AuthSession,
    inventoryAssetId: string,
    priceMinor: number,
  ) {
    const response = await request(this.app.getHttpServer())
      .post('/api/v1/lots')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ inventoryAssetId, priceMinor });

    expect([200, 201]).toContain(response.status);
    return response;
  }

  async createOrder(
    session: AuthSession,
    lotId: string,
    idempotencyKey: string,
  ) {
    return request(this.app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${session.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ lotId });
  }

  async mockSuccess(
    session: AuthSession,
    orderId: string,
    idempotencyKey: string,
  ) {
    return request(this.app.getHttpServer())
      .post(`/api/v1/trades/${orderId}/mock-success`)
      .set('Authorization', `Bearer ${session.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({});
  }

  async mockFail(
    session: AuthSession,
    orderId: string,
    idempotencyKey: string,
    mode: 'SAFE' | 'DISPUTE',
  ) {
    return request(this.app.getHttpServer())
      .post(`/api/v1/trades/${orderId}/mock-fail`)
      .set('Authorization', `Bearer ${session.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ mode });
  }

  async mockTimeout(
    session: AuthSession,
    orderId: string,
    idempotencyKey: string,
  ) {
    return request(this.app.getHttpServer())
      .post(`/api/v1/trades/${orderId}/mock-timeout`)
      .set('Authorization', `Bearer ${session.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({});
  }

  async getWallet(session: AuthSession) {
    return request(this.app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${session.token}`);
  }

  async getOrder(session: AuthSession, orderId: string) {
    return request(this.app.getHttpServer())
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${session.token}`);
  }

  async adminResolveDispute(
    admin: AuthSession,
    orderId: string,
    resolution: 'BUYER' | 'SELLER',
    idempotencyKey: string,
  ) {
    return request(this.app.getHttpServer())
      .post(`/api/v1/admin/orders/${orderId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ resolution, reason: 'admin e2e resolve' });
  }
}
