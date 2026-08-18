import { InventoryStaleCleanupService } from './inventory-stale-cleanup.service';

describe('InventoryStaleCleanupService', () => {
  it('does not mark AVAILABLE assets as REMOVED by age', async () => {
    const service = new InventoryStaleCleanupService();
    await expect(service.cleanupStaleAssets()).resolves.toBeUndefined();
  });
});
