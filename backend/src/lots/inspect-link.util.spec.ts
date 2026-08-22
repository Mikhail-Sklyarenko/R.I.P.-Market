import {
  buildFallbackInspectLink,
  buildInspectLink,
  extractInspectLinkTemplate,
  isUsableInspectLink,
  resolveInspectLink,
} from './inspect-link.util';

describe('inspect-link.util', () => {
  it('extracts inspect template from Steam actions', () => {
    const template = extractInspectLinkTemplate([
      {
        name: 'Inspect in Game...',
        link: 'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20%owner_steamid%A%assetid%D123',
      },
    ]);

    expect(template).toContain('%owner_steamid%');
    expect(template).toContain('%assetid%');
  });

  it('resolves inspect link with seller steam id and asset id', () => {
    const resolved = resolveInspectLink(
      'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20%owner_steamid%A%assetid%D123',
      '76561198000000000',
      '1234567890',
    );

    expect(resolved).toContain('76561198000000000');
    expect(resolved).toContain('1234567890');
    expect(resolved).not.toContain('%owner_steamid%');
    expect(isUsableInspectLink(resolved)).toBe(true);
  });

  it('resolves CS2 propid:6 template with Item Certificate payload', () => {
    const payload =
      'ADBD584A390016ACB5B48D3BA485AE9DA4952F0E5A47AEED62AEE5ADFDADC52E2D2D2DA1DDA56A5E748D';
    const resolved = resolveInspectLink(
      'steam://run/730//+csgo_econ_action_preview%20%propid:6%',
      '76561198000000000',
      '50889527765',
      payload,
    );

    expect(resolved).toBe(
      `steam://run/730//+csgo_econ_action_preview%20${payload}`,
    );
    expect(isUsableInspectLink(resolved)).toBe(true);
  });

  it('rejects unresolved propid placeholders', () => {
    const resolved = resolveInspectLink(
      'steam://run/730//+csgo_econ_action_preview%20%propid:6%',
      '76561198000000000',
      '50889527765',
    );

    expect(resolved).toBeNull();
    expect(
      isUsableInspectLink(
        'steam://run/730//+csgo_econ_action_preview%20%propid:6%',
      ),
    ).toBe(false);
  });

  it('builds fallback inspect link when template is missing', () => {
    const link = buildFallbackInspectLink({
      ownerSteamId: '76561198000000000',
      assetExternalId: '1234567890',
    });

    expect(link).toBe(
      'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A1234567890D0',
    );
    expect(isUsableInspectLink(link)).toBe(true);
  });

  it('returns prebuilt masked inspect links without placeholders as-is', () => {
    const template =
      'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20A00183C20B803280538';
    const resolved = resolveInspectLink(
      template,
      '76561198000000000',
      '1234567890',
    );

    expect(resolved).toBe(template);
  });

  it('falls back to classic S/A/D when CS2 template is unresolved', () => {
    const link = buildInspectLink({
      template: 'steam://run/730//+csgo_econ_action_preview%20%propid:6%',
      ownerSteamId: '76561198000000000',
      assetExternalId: '50889527765',
    });

    expect(link).toBe(
      'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A50889527765D0',
    );
  });
});
