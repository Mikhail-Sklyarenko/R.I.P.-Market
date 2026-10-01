import {
  DeliveryWorkflowService,
  PROTECTION_MS,
} from './delivery-workflow.service';
import {
  observeSteamInventory,
  type AssetObservation,
} from './inventory-observation';
jest.mock('./inventory-observation', () => ({
  ...jest.requireActual('./inventory-observation'),
  observeSteamInventory: jest.fn(),
}));
const observe = jest.mocked(observeSteamInventory);
const original: AssetObservation = {
  assetId: '50586848789',
  contextId: '2',
  appId: 730,
  classId: '123',
  instanceId: '0',
  marketHashName: 'Dual Berettas | BorDeux (Battle-Scarred)',
  floatValue: '0.8',
  paintSeed: 42,
  stickers: [],
};
const destination = {
  ...original,
  assetId: '999999',
  contextId: '16' as const,
};
const baseline = {
  original,
  seller: { fetchedAt: '2026-09-29T01:00:00Z', assets: [original] },
  buyer: { fetchedAt: '2026-09-29T01:00:00Z', assets: [] },
};
const verification = {
  status: 'accepted' as const,
  receiptVerified: true,
  tradeId: '744938690018816549',
  tradable: null,
  tradeLockUntil: null,
};
function fixture() {
  const op = {
    id: 'op',
    orderId: '0f57e21a-6068-4a8e-a67c-12671ad6ba5a',
    status: 'WAITING',
    expectedAssetId: original.assetId,
    externalOfferId: '9394782030',
    inventoryBaseline: baseline,
    deliveryProof: null as Record<string, unknown> | null,
    order: {
      seller: { steamId: '76561198195181115' },
      buyer: { steamId: '76561198655632881' },
    },
  };
  const prisma = {
    tradeOperation: {
      findUnique: jest.fn(async () => op),
      updateMany: jest.fn(
        async ({
          data,
        }: {
          data: { deliveryProof: Record<string, unknown> };
        }) => {
          if (op.deliveryProof) return { count: 0 };
          op.deliveryProof = data.deliveryProof;
          return { count: 1 };
        },
      ),
    },
    steamMappingLease: {
      findMany: jest.fn(async () => [
        { steamId: op.order.seller.steamId },
        { steamId: op.order.buyer.steamId },
      ]),
      deleteMany: jest.fn(async () => ({ count: 2 })),
    },
  };
  return { op, prisma, service: new DeliveryWorkflowService(prisma as never) };
}
beforeEach(() => {
  observe.mockReset();
  observe.mockImplementation(async (id) => ({
    fetchedAt: '2026-09-29T01:02:00Z',
    assets: id === '76561198195181115' ? [] : [destination],
  }));
});
it('persists control-trade proof with no destination ID in receipt and no credential', async () => {
  const { op, prisma, service } = fixture();
  expect(await service.verify(op.orderId, verification)).toMatchObject({
    result: 'confirmed',
    method: 'INVENTORY_DELTA',
  });
  expect(op.deliveryProof).toMatchObject({
    version: 2,
    offerId: '9394782030',
    destinationAssetId: destination.assetId,
    destinationContextId: '16',
    mappingMethod: 'INVENTORY_DELTA',
  });
  expect(
    Date.parse(op.deliveryProof!.protectionUntil as string) -
      Date.parse(op.deliveryProof!.verifiedAt as string),
  ).toBe(PROTECTION_MS);
  expect(JSON.stringify(op.deliveryProof)).not.toMatch(
    /token|cookie|credential/i,
  );
  expect(prisma.steamMappingLease.deleteMany).toHaveBeenCalled();
});
it('new process reuses persisted immutable proof; duplicate run does not replace it', async () => {
  const { op, prisma, service } = fixture();
  await service.verify(op.orderId, verification);
  const saved = JSON.stringify(op.deliveryProof);
  prisma.steamMappingLease.findMany.mockResolvedValue([]);
  expect(
    (
      await new DeliveryWorkflowService(prisma as never).verify(
        op.orderId,
        verification,
      )
    ).result,
  ).toBe('confirmed');
  expect(JSON.stringify(op.deliveryProof)).toBe(saved);
});
it('ambiguous delta persists no success and releases no mapping lock', async () => {
  const { op, prisma, service } = fixture();
  observe
    .mockResolvedValueOnce({ fetchedAt: '2026-09-29T01:02:00Z', assets: [] })
    .mockResolvedValueOnce({
      fetchedAt: '2026-09-29T01:02:00Z',
      assets: [destination, { ...destination, assetId: '888888' }],
    });
  expect((await service.verify(op.orderId, verification)).result).toBe(
    'ambiguous',
  );
  expect(op.deliveryProof).toBeNull();
  expect(prisma.steamMappingLease.deleteMany).not.toHaveBeenCalled();
});
it('missing serialization lock blocks delta mapping', async () => {
  const { op, prisma, service } = fixture();
  prisma.steamMappingLease.findMany.mockResolvedValue([]);
  expect((await service.verify(op.orderId, verification)).result).toBe(
    'unknown',
  );
  expect(op.deliveryProof).toBeNull();
});
it('client receipt or accepted-only status cannot create proof', async () => {
  const { op, service } = fixture();
  expect(
    (
      await service.verify(op.orderId, {
        ...verification,
        receiptVerified: false,
      })
    ).result,
  ).toBe('unknown');
  expect(observe).not.toHaveBeenCalled();
});
it('different fresh trade cannot replace saved proof', async () => {
  const { op, service } = fixture();
  await service.verify(op.orderId, verification);
  expect(
    (await service.verify(op.orderId, { ...verification, tradeId: '111' }))
      .result,
  ).toBe('ambiguous');
  expect(op.deliveryProof?.tradeId).toBe(verification.tradeId);
});

describe('pre-send preparation', () => {
  function preparation() {
    const op = {
      id: 'op',
      orderId: 'new-order',
      expectedAssetId: original.assetId,
      externalOfferId: null as string | null,
      inventoryBaseline: null as unknown,
      order: {
        status: 'WAITING_TRADE',
        seller: { steamId: '76561198195181115' },
        buyer: { steamId: '76561198655632881' },
      },
    };
    const tx = {
      $executeRaw: jest.fn(async () => 0),
      $queryRaw: jest.fn(async () => [{ orderId: op.orderId }]),
    };
    const prisma = {
      tradeOperation: {
        findUnique: jest.fn(async () => op),
        updateMany: jest.fn(async ({ data }) => {
          Object.assign(op, data);
          return { count: 1 };
        }),
      },
      tradeTask: { findFirst: jest.fn(async (): Promise<unknown> => null) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      $executeRaw: jest.fn(async () => 0),
    };
    observe.mockImplementation(async (id) => ({
      fetchedAt: new Date().toISOString(),
      assets: id === op.order.seller.steamId ? [original] : [],
    }));
    return {
      op,
      tx,
      prisma,
      service: new DeliveryWorkflowService(prisma as never),
    };
  }
  it('persists both server baselines and binding before dispatch', async () => {
    const { op, tx, service } = preparation();
    expect(await service.prepare(op.orderId)).toBe(true);
    expect(op.inventoryBaseline).toMatchObject({
      original,
      buyer: { assets: [] },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledTimes(2);
  });
  it('does not fabricate a before snapshot after sending began', async () => {
    const { op, prisma, service } = preparation();
    prisma.tradeTask.findFirst.mockResolvedValue({ sendStartedAt: new Date() });
    expect(await service.prepare(op.orderId)).toBe(false);
    expect(observe).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('another unresolved account window prevents preparation', async () => {
    const { op, tx, service } = preparation();
    tx.$queryRaw.mockResolvedValue([]);
    expect(await service.prepare(op.orderId)).toBe(false);
    expect(op).toMatchObject({ failReasonCode: 'MAPPING_WINDOW_BUSY' });
    expect(observe).not.toHaveBeenCalled();
  });
  it('reports missing original separately from an unavailable Steam inventory', async () => {
    const { op, service } = preparation();
    observe.mockResolvedValue({
      fetchedAt: new Date().toISOString(),
      assets: [],
    });
    expect(await service.prepare(op.orderId)).toBe(false);
    expect(op).toMatchObject({
      inventoryBaseline: null,
      failReasonCode: 'BASELINE_ORIGINAL_MISSING',
    });
  });
  it('incomplete inventory schedules a retry without publishing a baseline', async () => {
    const { op, service, prisma } = preparation();
    observe.mockRejectedValueOnce(new Error('INVENTORY_INCOMPLETE'));
    expect(await service.prepare(op.orderId)).toBe(false);
    expect(op.inventoryBaseline).toBeNull();
    expect(prisma.tradeOperation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextPreparationAt: expect.any(Date),
          failReasonCode: 'BASELINE_UNAVAILABLE',
        }),
      }),
    );
  });
});
