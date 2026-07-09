export function isExtensionFirstTradeFlowEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW === 'true';
}
