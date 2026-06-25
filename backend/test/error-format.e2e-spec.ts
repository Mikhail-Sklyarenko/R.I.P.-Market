import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from '@prisma/client';
import { ErrorCode } from '../src/common/errors/error-codes';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';

describe('Unified error format (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let api: ApiClient;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    api = new ApiClient(app);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns validation error format', async () => {
    const seller = await api.login(UserRole.SELLER);

    const response = await request(app.getHttpServer())
      .post('/api/v1/lots')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ inventoryAssetId: 'not-a-uuid', priceMinor: -1 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      statusCode: 400,
    });
    expect(response.body.error.requestId).toBeTruthy();
    expect(Array.isArray(response.body.error.fields)).toBe(true);
  });

  it('returns business error code for unavailable asset', async () => {
    const seller = await api.login(UserRole.SELLER);
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body[0].id as string;

    await api.createLot(seller, assetId, 100_000);

    const response = await request(app.getHttpServer())
      .post('/api/v1/lots')
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ inventoryAssetId: assetId, priceMinor: 100_000 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: ErrorCode.LOT_ALREADY_EXISTS_FOR_ASSET,
      statusCode: 400,
      message: expect.any(String),
    });
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('returns unauthorized error format', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/inventory');

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      statusCode: 401,
    });
  });
});
