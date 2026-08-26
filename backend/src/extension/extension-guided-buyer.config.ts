/**
 * I5: Guided buyer accept (site wizard + Steam accept assists).
 * Unset = enabled (legacy); set ENABLE_EXTENSION_GUIDED_BUYER=false to kill.
 */
export function isExtensionGuidedBuyerEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_GUIDED_BUYER !== 'false';
}
