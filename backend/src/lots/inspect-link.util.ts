const STEAM_CLASSIC_INSPECT_PREFIX =
  'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20';

const UNRESOLVED_PLACEHOLDER = /%[a-z0-9_:]+%/i;

export function extractInspectLinkTemplate(
  actions?: Array<{ link?: string; name?: string }> | null,
): string | null {
  if (!actions?.length) {
    return null;
  }
  const inspectAction = actions.find(
    (action) =>
      action.link?.includes('csgo_econ_action_preview') ||
      action.name?.toLowerCase().includes('inspect'),
  );
  return inspectAction?.link?.trim() || null;
}

export function isUsableInspectLink(
  link: string | null | undefined,
): link is string {
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
  return !UNRESOLVED_PLACEHOLDER.test(normalized);
}

export function resolveInspectLink(
  template: string | null | undefined,
  ownerSteamId: string | null | undefined,
  assetExternalId: string | null | undefined,
  inspectLinkPayload?: string | null,
): string | null {
  if (!template?.trim()) {
    return null;
  }

  if (!ownerSteamId || !assetExternalId) {
    return null;
  }

  const resolved = template
    .trim()
    .replace(/%owner_steamid%/gi, ownerSteamId)
    .replace(/%assetid%/gi, assetExternalId)
    .replace(/%contextid%/gi, '2')
    .replace(/%propid:(\d+)%/gi, (_, rawId: string) => {
      const propId = Number(rawId);
      if (propId === 6 && inspectLinkPayload?.trim()) {
        return inspectLinkPayload.trim();
      }
      return `%propid:${rawId}%`;
    });

  if (UNRESOLVED_PLACEHOLDER.test(resolved)) {
    return null;
  }

  if (
    !resolved.startsWith('steam://') ||
    !resolved.includes('csgo_econ_action_preview')
  ) {
    return null;
  }

  return resolved;
}

/** Classic S/A/D inspect link when Steam template or Item Certificate is unavailable. */
export function buildFallbackInspectLink(params: {
  ownerSteamId: string;
  assetExternalId: string;
}): string {
  const payload = `S${params.ownerSteamId}A${params.assetExternalId}D0`;
  return `${STEAM_CLASSIC_INSPECT_PREFIX}${encodeURIComponent(payload)}`;
}

export type BuildInspectLinkParams = {
  template?: string | null;
  ownerSteamId: string;
  assetExternalId: string;
  /** CS2 Item Certificate hex from Steam asset_properties (propertyid 6). */
  inspectLinkPayload?: string | null;
};

export function buildInspectLink(params: BuildInspectLinkParams): string {
  const fromTemplate = resolveInspectLink(
    params.template,
    params.ownerSteamId,
    params.assetExternalId,
    params.inspectLinkPayload,
  );
  if (isUsableInspectLink(fromTemplate)) {
    return fromTemplate;
  }
  return buildFallbackInspectLink({
    ownerSteamId: params.ownerSteamId,
    assetExternalId: params.assetExternalId,
  });
}
