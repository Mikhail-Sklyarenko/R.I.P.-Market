/**
 * Pure helpers for inventory sell-panel request generations.
 * Bumping the generation invalidates in-flight list/update responses.
 */

export function nextListingRequestGeneration(current: number): number {
  return current + 1;
}

export function isListingRequestCurrent(
  requestId: number,
  currentGeneration: number,
): boolean {
  return requestId === currentGeneration;
}
