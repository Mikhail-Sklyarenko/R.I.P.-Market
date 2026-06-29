import { INestApplication } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiClient } from './helpers/api-client';
import { createE2eApp } from './helpers/bootstrap-e2e-app';
import { resetDatabase } from './helpers/reset-database';

describe('Admin backoffice (e2e)', () => {
  let app: INestApplication;
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

  it('admin can block and unblock an ACTIVE lot with audit trail', async () => {
    const seller = await api.login(UserRole.SELLER);
    const inventory = await api.getInventory(seller);
    const assetId = inventory.body.assets[0].id as string;
    const lot = await api.createLot(seller, assetId, 100_000);
    const admin = await api.login(UserRole.ADMIN);

    const blockResponse = await request(app.getHttpServer())
      .post(`/api/v1/admin/lots/${lot.body.id}/block`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'admin-block-1')
      .send({ reason: 'Policy violation' });

    expect(blockResponse.status).toBe(201);
    expect(blockResponse.body.lot.status).toBe('BLOCKED');

    const auditAfterBlock = await prisma.auditLog.findFirst({
      where: {
        entityType: 'lot',
        entityId: lot.body.id,
        action: 'ADMIN_LOT_BLOCKED',
      },
    });
    expect(auditAfterBlock?.reason).toBe('Policy violation');

    const unblockResponse = await request(app.getHttpServer())
      .post(`/api/v1/admin/lots/${lot.body.id}/unblock`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'admin-unblock-1')
      .send({ reason: 'Issue cleared' });

    expect([200, 201]).toContain(unblockResponse.status);
    expect(unblockResponse.body.lot.status).toBe('ACTIVE');
  });

  it('admin can cancel ACTIVE lot and restrict user with audit', async () => {
    const seller = await api.login(UserRole.SELLER);
    const inventory = await api.getInventory(seller);
    const lot = await api.createLot(
      seller,
      inventory.body.assets[0].id as string,
      120_000,
    );
    const admin = await api.login(UserRole.ADMIN);

    const cancelResponse = await request(app.getHttpServer())
      .post(`/api/v1/admin/lots/${lot.body.id}/cancel`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'admin-cancel-1')
      .send({ reason: 'Fraud review' });

    expect([200, 201]).toContain(cancelResponse.status);
    expect(cancelResponse.body.lot.status).toBe('CANCELED');

    const restrictResponse = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${seller.userId}/restrict`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', 'admin-restrict-1')
      .send({ status: UserStatus.SUSPENDED, reason: 'Fraud review' });

    expect([200, 201]).toContain(restrictResponse.status);
    expect(restrictResponse.body.user.status).toBe('SUSPENDED');
    expect(restrictResponse.body.isRestricted).toBe(true);
  });
});
