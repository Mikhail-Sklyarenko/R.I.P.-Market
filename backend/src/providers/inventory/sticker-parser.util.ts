export type ListingSticker = {
  name: string;
  wearPercent: number | null;
};

const STICKER_LINE_RE = /^Sticker:\s*(.+?)(?:\s*\((\d+)%\))?\s*$/i;

export function parseStickersFromDescriptionLines(
  lines?: Array<{ value?: string }>,
): ListingSticker[] {
  const stickers: ListingSticker[] = [];
  for (const line of lines ?? []) {
    const value = line.value?.trim();
    if (!value) {
      continue;
    }
    const match = value.match(STICKER_LINE_RE);
    if (!match?.[1]) {
      continue;
    }
    stickers.push({
      name: match[1].trim(),
      wearPercent: match[2] ? Number(match[2]) : null,
    });
  }
  return stickers;
}
