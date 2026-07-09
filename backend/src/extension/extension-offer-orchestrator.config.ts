export function isExtensionOfferOrchestratorEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_OFFER_ORCHESTRATOR === 'true';
}
