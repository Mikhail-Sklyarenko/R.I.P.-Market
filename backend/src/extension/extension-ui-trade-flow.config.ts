export function isExtensionUiTradeFlowEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_UI_TRADE_FLOW === 'true';
}
