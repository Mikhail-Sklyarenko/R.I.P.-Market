import { parseStickersFromDescriptionLines } from './sticker-parser.util';

describe('sticker-parser.util', () => {
  it('parses sticker lines from Steam description entries', () => {
    const stickers = parseStickersFromDescriptionLines([
      { value: 'Exterior: Field-Tested' },
      { value: 'Sticker: Titan (Holo) | Katowice 2014 (42%)' },
      { value: 'Sticker: Crown (Foil)' },
    ]);

    expect(stickers).toEqual([
      { name: 'Titan (Holo) | Katowice 2014', wearPercent: 42 },
      { name: 'Crown (Foil)', wearPercent: null },
    ]);
  });
});
