/**
 * I5: Inventory layer (Steam CS2 inventory overlays / one-click sell).
 * Unset = enabled (legacy); set ENABLE_EXTENSION_INVENTORY_LAYER=false to kill.
 */
export function isExtensionInventoryLayerEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_INVENTORY_LAYER !== 'false';
}
