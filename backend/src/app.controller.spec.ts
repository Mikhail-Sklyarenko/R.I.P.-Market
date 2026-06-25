import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpMetricsService } from './common/observability/http-metrics.service';
import { PrismaService } from './prisma/prisma.service';
import { LedgerReconciliationService } from './wallet/ledger-reconciliation.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
          },
        },
        {
          provide: LedgerReconciliationService,
          useValue: {
            reconcile: jest.fn(),
            publishFailureAlert: jest.fn(),
          },
        },
        {
          provide: HttpMetricsService,
          useValue: {
            snapshot: jest.fn(() => ({
              '2xx': 1,
              '3xx': 0,
              '4xx': 0,
              '5xx': 0,
            })),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return healthy status payload', async () => {
      await expect(appController.getHealth()).resolves.toMatchObject({
        service: 'cs2-p2p-backend',
        status: 'ok',
        database: 'ok',
      });
    });
  });
});
