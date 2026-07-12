import {
  buildFallbackInspectLink,
  extractInspectLinkTemplate,
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
  });

  it('builds fallback inspect link when template is missing', () => {
    const link = buildFallbackInspectLink({
      ownerSteamId: '76561198000000000',
      assetExternalId: '1234567890',
      classId: '310776',
      instanceId: '302028390',
    });

    expect(link).toContain('76561198000000000');
    expect(link).toContain('csgo_econ_action_preview');
    expect(decodeURIComponent(link)).toContain('D310776A302028390');
  });

  it('returns prebuilt inspect links without placeholders as-is', () => {
    const template =
      'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20A00183C20B803280538';
    const resolved = resolveInspectLink(
      template,
      '76561198000000000',
      '1234567890',
    );

    expect(resolved).toBe(template);
  });
});
