/**
 * I5: Quiet Chrome notifications (new deal / Guard / Accept / mismatch).
 * Unset = enabled (legacy); set ENABLE_EXTENSION_QUIET_NOTIFICATIONS=false to kill.
 */
export function isExtensionQuietNotificationsEnabled(): boolean {
  return process.env.ENABLE_EXTENSION_QUIET_NOTIFICATIONS !== 'false';
}
