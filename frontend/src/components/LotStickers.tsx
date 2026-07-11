export type ListingSticker = {
  name: string;
  wearPercent?: number | null;
};

type LotStickersProps = {
  stickers?: ListingSticker[] | null;
  testIdPrefix?: string;
};

export function LotStickers({ stickers, testIdPrefix = 'lot' }: LotStickersProps) {
  if (!stickers || stickers.length === 0) {
    return null;
  }

  return (
    <div className="lot-stickers" data-testid={`${testIdPrefix}-stickers`}>
      <p className="field-label">Стикеры</p>
      <ul className="lot-stickers-list">
        {stickers.map((sticker, index) => (
          <li
            key={`${sticker.name}-${index}`}
            className="lot-stickers-item muted small"
            data-testid={`${testIdPrefix}-sticker-${index}`}
          >
            {sticker.name}
            {sticker.wearPercent !== null && sticker.wearPercent !== undefined
              ? ` (${sticker.wearPercent}%)`
              : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
