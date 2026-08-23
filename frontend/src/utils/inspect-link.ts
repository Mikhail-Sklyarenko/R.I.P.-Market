/** True when a steam:// inspect URL is complete (no unresolved %placeholders%). */
export function isUsableInspectLink(link: string | null | undefined): link is string {
  if (!link?.trim()) {
    return false;
  }
  const normalized = link.trim();
  if (!normalized.startsWith('steam://')) {
    return false;
  }
  if (!normalized.includes('csgo_econ_action_preview')) {
    return false;
  }
  return !/%[a-z0-9_:]+%/i.test(normalized);
}

function extractInspectPayload(link: string): string | null {
  const match = link.match(/csgo_econ_action_preview(?:%20|\s)(.+)$/i);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

/** Classic S/A/D0 links work less reliably than CS2 Item Certificate links. */
export function isFallbackInspectLink(link: string | null | undefined): boolean {
  if (!isUsableInspectLink(link)) {
    return false;
  }
  const payload = extractInspectPayload(link);
  return Boolean(payload && /^S\d+A\d+D0$/i.test(payload));
}

export type InspectLinkState =
  | { kind: 'none' }
  | { kind: 'reliable'; href: string }
  | { kind: 'limited'; href: string }
  | { kind: 'unavailable'; reason: 'broken' };

export function resolveInspectLinkState(
  link: string | null | undefined,
): InspectLinkState {
  if (!link?.trim()) {
    return { kind: 'none' };
  }
  if (!isUsableInspectLink(link)) {
    return { kind: 'unavailable', reason: 'broken' };
  }
  if (isFallbackInspectLink(link)) {
    return { kind: 'limited', href: link };
  }
  return { kind: 'reliable', href: link };
}
