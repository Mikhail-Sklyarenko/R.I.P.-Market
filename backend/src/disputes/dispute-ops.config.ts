export function isDisputeOpsEnabled(): boolean {
  return process.env.ENABLE_DISPUTE_OPS !== 'false';
}

export function isExtensionDisputeBridgeEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_DISPUTE_BRIDGE === 'true';
}
