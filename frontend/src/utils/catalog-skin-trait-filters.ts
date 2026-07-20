export type SkinTraitCheckboxState = {
  includeStatTrak: boolean;
  excludeStatTrak: boolean;
  includeSouvenir: boolean;
  excludeSouvenir: boolean;
};

export const EMPTY_SKIN_TRAIT_FILTERS: SkinTraitCheckboxState = {
  includeStatTrak: false,
  excludeStatTrak: false,
  includeSouvenir: false,
  excludeSouvenir: false,
};

export type SkinTraitApiFilter = 'only' | 'exclude';

export function resolveSkinTraitApiFilter(
  include: boolean,
  exclude: boolean,
): SkinTraitApiFilter | undefined {
  if (include && !exclude) {
    return 'only';
  }
  if (exclude && !include) {
    return 'exclude';
  }
  return undefined;
}

export function skinTraitFiltersToQuery(state: SkinTraitCheckboxState): {
  stattrak?: SkinTraitApiFilter;
  souvenir?: SkinTraitApiFilter;
} {
  const stattrak = resolveSkinTraitApiFilter(
    state.includeStatTrak,
    state.excludeStatTrak,
  );
  const souvenir = resolveSkinTraitApiFilter(
    state.includeSouvenir,
    state.excludeSouvenir,
  );
  return {
    ...(stattrak ? { stattrak } : {}),
    ...(souvenir ? { souvenir } : {}),
  };
}

export function hasActiveSkinTraitFilters(state: SkinTraitCheckboxState): boolean {
  const query = skinTraitFiltersToQuery(state);
  return Boolean(query.stattrak || query.souvenir);
}
