const STEAM_RUN_GAME_PREFIX = 'steam://rungame/730/76561202255233023/';

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

export function resolveInspectLink(
  template: string | null | undefined,
  ownerSteamId: string | null | undefined,
  assetExternalId: string | null | undefined,
): string | null {
  if (!template?.trim() || !ownerSteamId || !assetExternalId) {
    return null;
  }

  const normalizedTemplate = template.trim();
  const hasPlaceholders = /%owner_steamid%|%assetid%|%contextid%/i.test(
    normalizedTemplate,
  );

  if (!hasPlaceholders) {
    if (
      normalizedTemplate.startsWith('steam://') &&
      normalizedTemplate.includes('csgo_econ_action_preview')
    ) {
      return normalizedTemplate;
    }
    return null;
  }

  const resolved = normalizedTemplate
    .replace(/%owner_steamid%/gi, ownerSteamId)
    .replace(/%assetid%/gi, assetExternalId)
    .replace(/%contextid%/gi, '2');

  if (/%owner_steamid%|%assetid%|%contextid%/i.test(resolved)) {
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

export function buildFallbackInspectLink(params: {
  ownerSteamId: string;
  assetExternalId: string;
  classId?: string | null;
  instanceId?: string | null;
}): string {
  const descriptor =
    params.classId && params.instanceId
      ? `${params.classId}A${params.instanceId}`
      : '0';
  const encoded = encodeURIComponent(
    `S${params.ownerSteamId}A${params.assetExternalId}D${descriptor}`,
  );
  return `${STEAM_RUN_GAME_PREFIX}${params.ownerSteamId}/+csgo_econ_action_preview%20${encoded}`;
}
