export function isTradeReferenceReconcileEnabled(): boolean {
  return process.env.ENABLE_TRADE_REFERENCE_RECONCILE === 'true';
}

export function isExtensionTradeReferenceEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_TRADE_REFERENCE === 'true';
}
