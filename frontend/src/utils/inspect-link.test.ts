import { describe, expect, it } from 'vitest';
import { isUsableInspectLink } from './inspect-link';

describe('isUsableInspectLink', () => {
  it('rejects unresolved CS2 propid placeholders', () => {
    expect(
      isUsableInspectLink(
        'steam://run/730//+csgo_econ_action_preview%20%propid:6%',
      ),
    ).toBe(false);
  });

  it('accepts resolved masked inspect links', () => {
    expect(
      isUsableInspectLink(
        'steam://run/730//+csgo_econ_action_preview%20ADBD584A390016ACB5B48D3BA485AE9',
      ),
    ).toBe(true);
  });

  it('accepts classic S/A/D inspect links', () => {
    expect(
      isUsableInspectLink(
        'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A50889527765D0',
      ),
    ).toBe(true);
  });
});
