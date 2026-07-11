import { ExtensionRolloutService } from './extension-rollout.service';

describe('ExtensionRolloutService', () => {
  const originalEnv = process.env;

  const prisma = {
    user: { findUnique: jest.fn() },
    extensionRolloutAllowlistEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    order: { findUnique: jest.fn() },
    tradeTask: { findFirst: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ENABLE_EXTENSION_TASK_PIPELINE: 'true',
      ENABLE_EXTENSION_ROLLOUT: 'true',
      EXTENSION_ROLLOUT_KILL_SWITCH: 'false',
      EXTENSION_ROLLOUT_STAGE: 'allowlist',
      EXTENSION_ROLLOUT_ALLOWLIST_STEAM_IDS: '76561198000000001',
    };
    prisma.user.findUnique.mockResolvedValue({ steamId: '76561198000000001' });
    prisma.extensionRolloutAllowlistEntry.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const service = () =>
    new ExtensionRolloutService({
      user: prisma.user,
      extensionRolloutAllowlistEntry: prisma.extensionRolloutAllowlistEntry,
      order: prisma.order,
      tradeTask: prisma.tradeTask,
    } as never);

  it('allows env allowlisted seller', async () => {
    const decision =
      await service().shouldCreateExtensionTaskForSeller('seller-1');
    expect(decision.eligible).toBe(true);
    expect(decision.reason).toBe('allowlist_match');
  });

  it('blocks when kill switch is active', async () => {
    process.env.EXTENSION_ROLLOUT_KILL_SWITCH = 'true';
    const decision =
      await service().shouldCreateExtensionTaskForSeller('seller-1');
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe('kill_switch');
  });

  it('passes through when rollout gating is disabled', async () => {
    process.env.ENABLE_EXTENSION_ROLLOUT = 'false';
    const decision =
      await service().shouldCreateExtensionTaskForSeller('seller-1');
    expect(decision.eligible).toBe(true);
    expect(decision.reason).toBe('rollout_gating_disabled');
  });

  it('uses stable percent bucket', async () => {
    process.env.EXTENSION_ROLLOUT_STAGE = 'percent';
    process.env.EXTENSION_ROLLOUT_PERCENT = '50';
    process.env.EXTENSION_ROLLOUT_ALLOWLIST_STEAM_IDS = '';
    prisma.user.findUnique.mockResolvedValue({ steamId: '76561198999999999' });
    prisma.extensionRolloutAllowlistEntry.findUnique.mockResolvedValue(null);

    const first =
      await service().shouldCreateExtensionTaskForSeller('seller-stable-a');
    const second =
      await service().shouldCreateExtensionTaskForSeller('seller-stable-a');
    expect(first.eligible).toBe(second.eligible);
    expect(first.reason).toBe(second.reason);
  });

  it('grants in-flight grace for active task under kill switch', async () => {
    process.env.EXTENSION_ROLLOUT_KILL_SWITCH = 'true';
    process.env.EXTENSION_ROLLOUT_INFLIGHT_GRACE = 'true';
    prisma.order.findUnique.mockResolvedValue({ status: 'WAITING_TRADE' });
    prisma.tradeTask.findFirst.mockResolvedValue({ id: 'task-1' });

    const grace = await service().hasInflightExtensionGrace('order-1');
    expect(grace).toBe(true);
  });

  it('rejects in-flight grace when disabled', async () => {
    process.env.EXTENSION_ROLLOUT_KILL_SWITCH = 'true';
    process.env.EXTENSION_ROLLOUT_INFLIGHT_GRACE = 'false';
    const grace = await service().hasInflightExtensionGrace('order-1');
    expect(grace).toBe(false);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });
});
