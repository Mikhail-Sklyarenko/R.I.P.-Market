import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { DisputeFinancialGuardService } from '../disputes/dispute-financial-guard.service';
import { DisputeOpsService } from '../disputes/dispute-ops.service';

describe('AdminService dispute ops', () => {
  const prisma = {
    auditLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    order: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const disputeOpsService = {
    listReasonCodes: jest.fn().mockReturnValue({ reasons: [] }),
    buildOrderTimeline: jest.fn().mockResolvedValue([]),
  };
  const disputeFinancialGuard = new DisputeFinancialGuardService();
  const service = new AdminService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    disputeOpsService as unknown as DisputeOpsService,
    disputeFinancialGuard,
  );

  it('exposes reason taxonomy for admin UI', () => {
    service.listDisputeReasonCodes();
    expect(disputeOpsService.listReasonCodes).toHaveBeenCalled();
  });

  it('rejects unknown admin reason codes', () => {
    expect(() =>
      (
        service as unknown as {
          resolveAdminReason: (
            body: { reasonCode: string },
            action: string,
          ) => void;
        }
      ).resolveAdminReason({ reasonCode: 'NOT_A_REAL_CODE' }, 'ADMIN_DISPUTE'),
    ).toThrow();
  });
});

describe('Admin access control contract', () => {
  it('admin controller is decorated with ADMIN role', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AdminController);
    expect(roles).toEqual([UserRole.ADMIN]);
  });
});
