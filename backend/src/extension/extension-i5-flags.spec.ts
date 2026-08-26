import { isExtensionInventoryLayerEnabled } from './extension-inventory-layer.config';
import { isExtensionGuidedBuyerEnabled } from './extension-guided-buyer.config';
import { isExtensionQuietNotificationsEnabled } from './extension-quiet-notifications.config';
import { getExtensionPublicConfig } from './extension-public.config';
import { snapshotExtensionFeatureFlags } from './extension-rollout.config';

const KEYS = [
  'ENABLE_EXTENSION_INVENTORY_LAYER',
  'ENABLE_EXTENSION_GUIDED_BUYER',
  'ENABLE_EXTENSION_QUIET_NOTIFICATIONS',
] as const;

describe('I5 extension UX feature flags', () => {
  afterEach(() => {
    for (const key of KEYS) {
      delete process.env[key];
    }
  });

  it('defaults to on when unset (no live UX regression)', () => {
    expect(isExtensionInventoryLayerEnabled()).toBe(true);
    expect(isExtensionGuidedBuyerEnabled()).toBe(true);
    expect(isExtensionQuietNotificationsEnabled()).toBe(true);
    const publicConfig = getExtensionPublicConfig();
    expect(publicConfig.extensionInventoryLayerEnabled).toBe(true);
    expect(publicConfig.extensionGuidedBuyerEnabled).toBe(true);
    expect(publicConfig.extensionQuietNotificationsEnabled).toBe(true);
  });

  it('kills independently when set to false', () => {
    process.env.ENABLE_EXTENSION_INVENTORY_LAYER = 'false';
    process.env.ENABLE_EXTENSION_GUIDED_BUYER = 'false';
    process.env.ENABLE_EXTENSION_QUIET_NOTIFICATIONS = 'false';
    expect(isExtensionInventoryLayerEnabled()).toBe(false);
    expect(isExtensionGuidedBuyerEnabled()).toBe(false);
    expect(isExtensionQuietNotificationsEnabled()).toBe(false);
    const snap = snapshotExtensionFeatureFlags();
    expect(snap.ENABLE_EXTENSION_INVENTORY_LAYER).toBe(false);
    expect(snap.ENABLE_EXTENSION_GUIDED_BUYER).toBe(false);
    expect(snap.ENABLE_EXTENSION_QUIET_NOTIFICATIONS).toBe(false);
  });

  it('treats explicit true as on', () => {
    process.env.ENABLE_EXTENSION_INVENTORY_LAYER = 'true';
    expect(isExtensionInventoryLayerEnabled()).toBe(true);
  });
});
