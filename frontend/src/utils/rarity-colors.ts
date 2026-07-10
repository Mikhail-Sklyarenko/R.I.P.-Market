export type RarityStyle = {
  color: string;
  glow: string;
};

const FALLBACK: RarityStyle = {
  color: '#64748b',
  glow: 'rgba(100, 116, 139, 0.35)',
};

const RARITY_STYLES: Record<string, RarityStyle> = {
  'Consumer Grade': { color: '#b0c3d9', glow: 'rgba(176, 195, 217, 0.45)' },
  'Industrial Grade': { color: '#5e98d9', glow: 'rgba(94, 152, 217, 0.5)' },
  'Mil-Spec Grade': { color: '#4b69ff', glow: 'rgba(75, 105, 255, 0.5)' },
  'Mil-Spec': { color: '#4b69ff', glow: 'rgba(75, 105, 255, 0.5)' },
  Restricted: { color: '#8847ff', glow: 'rgba(136, 71, 255, 0.5)' },
  Classified: { color: '#d32ce6', glow: 'rgba(211, 44, 230, 0.5)' },
  Covert: { color: '#eb4b4b', glow: 'rgba(235, 75, 75, 0.5)' },
  Contraband: { color: '#e4ae39', glow: 'rgba(228, 174, 57, 0.55)' },
  Extraordinary: { color: '#e4ae39', glow: 'rgba(228, 174, 57, 0.55)' },
};

export const CATALOG_RARITY_FILTERS = [
  { value: 'Covert', label: 'Covert' },
  { value: 'Classified', label: 'Classified' },
  { value: 'Restricted', label: 'Restricted' },
  { value: 'Mil-Spec Grade', label: 'Mil-Spec' },
  { value: 'Contraband', label: 'Contraband' },
  { value: 'Extraordinary', label: 'Extraordinary' },
] as const;

function normalizeRarity(rarity: string): string {
  if (rarity === 'Mil-Spec') {
    return 'Mil-Spec Grade';
  }
  return rarity;
}

export function getRarityStyle(rarity?: string | null): RarityStyle {
  if (!rarity?.trim()) {
    return FALLBACK;
  }
  return RARITY_STYLES[normalizeRarity(rarity.trim())] ?? FALLBACK;
}
