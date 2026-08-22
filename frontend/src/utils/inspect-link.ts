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
