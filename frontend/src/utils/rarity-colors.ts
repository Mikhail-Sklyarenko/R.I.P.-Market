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
  'Exceedingly Rare': { color: '#e4ae39', glow: 'rgba(228, 174, 57, 0.55)' },
  'Base Grade': { color: '#b0c3d9', glow: 'rgba(176, 195, 217, 0.35)' },
};

export const RARITY_DISPLAY_LABELS: Record<string, string> = {
  'Consumer Grade': 'Ширпотреб',
  'Industrial Grade': 'Промышленное качество',
  'Mil-Spec Grade': 'Армейское качество',
  'Mil-Spec': 'Армейское качество',
  Restricted: 'Запрещённое',
  Classified: 'Засекречённое',
  Covert: 'Тайное',
  Extraordinary: 'Скрытое',
  'Exceedingly Rare': 'Скрытое',
  Contraband: 'Контрабанда',
  'Base Grade': 'Базовый тип',
};

export const CATALOG_RARITY_FILTERS = [
  { value: 'Covert', label: 'Тайное' },
  { value: 'Classified', label: 'Засекречённое' },
  { value: 'Restricted', label: 'Запрещённое' },
  { value: 'Mil-Spec Grade', label: 'Армейское качество' },
  { value: 'Industrial Grade', label: 'Промышленное качество' },
  { value: 'Consumer Grade', label: 'Ширпотреб' },
  { value: 'Contraband', label: 'Контрабанда' },
  { value: 'Extraordinary', label: 'Скрытое' },
] as const;

function normalizeRarity(rarity: string): string {
  if (rarity === 'Mil-Spec') {
    return 'Mil-Spec Grade';
  }
  return rarity;
}

export function getRarityDisplayLabel(rarity?: string | null): string | null {
  if (!rarity?.trim()) {
    return null;
  }
  const normalized = normalizeRarity(rarity.trim());
  return RARITY_DISPLAY_LABELS[normalized] ?? normalized;
}

export function getRarityStyle(rarity?: string | null): RarityStyle {
  if (!rarity?.trim()) {
    return FALLBACK;
  }
  return RARITY_STYLES[normalizeRarity(rarity.trim())] ?? FALLBACK;
}
