import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { DisputeFinancialGuardService } from '../disputes/dispute-financial-guard.service';
import { DisputeOpsService } from '../disputes/dispute-ops.service';

describe('AdminService dispute ops', () => {
  const prisma = {
    auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
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
      (service as unknown as { resolveAdminReason: Function }).resolveAdminReason(
        { reasonCode: 'NOT_A_REAL_CODE' },
        'ADMIN_DISPUTE',
      ),
    ).toThrow();
  });
});

describe('Admin access control contract', () => {
  it('admin controller is decorated with ADMIN role', () => {
    const { ROLES_KEY } = require('../auth/roles.decorator');
    const { AdminController } = require('./admin.controller');
    const roles = Reflect.getMetadata(ROLES_KEY, AdminController);
    expect(roles).toEqual([UserRole.ADMIN]);
  });
});
