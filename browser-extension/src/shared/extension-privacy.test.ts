import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPrivacyTransparency,
  EXTENSION_OPTIONAL_STEAM_API_PERMISSION,
  EXTENSION_REQUIRED_PERMISSIONS,
  permissionRationaleLines,
  privacyTransparencyHtml,
  STEAM_WEB_API_OPTIONAL_ORIGINS,
} from './extension-privacy.js';

describe('extension-privacy (H3)', () => {
  it('keeps required permissions minimal and documents each one', () => {
    expect(EXTENSION_REQUIRED_PERMISSIONS.every((row) => row.required)).toBe(
      true,
    );
    expect(EXTENSION_REQUIRED_PERMISSIONS.map((row) => row.id)).toEqual([
      'storage',
      'alarms',
      'tabs',
      'scripting',
      'cookies',
      'notifications',
      'host:steamcommunity',
      'host:platform',
    ]);
    expect(EXTENSION_OPTIONAL_STEAM_API_PERMISSION.required).toBe(false);
    expect([...STEAM_WEB_API_OPTIONAL_ORIGINS]).toEqual([
      'https://api.steampowered.com/*',
    ]);
  });

  it('builds RU/EN transparency without pushing an API key', () => {
    const ru = buildPrivacyTransparency('ru');
    const en = buildPrivacyTransparency('en');
    expect(ru.dontItems.some((line) => /Web API|ключ/i.test(line))).toBe(true);
    expect(en.dontItems.some((line) => /Web API key/i.test(line))).toBe(true);
    expect(ru.doItems.join(' ')).not.toMatch(/вставьте ключ/i);
    expect(en.doItems.join(' ')).not.toMatch(/paste a key/i);
  });

  it('renders escaped privacy HTML', () => {
    const html = privacyTransparencyHtml({
      title: 'What we do',
      doItems: ['Help <deals>'],
      dontItems: ['Never & auto-Accept'],
    });
    expect(html).toContain('Help &lt;deals&gt;');
    expect(html).toContain('Never &amp; auto-Accept');
    expect(html).toContain('What we never do');
  });

  it('includes optional Steam API rationale only when requested', () => {
    const base = permissionRationaleLines('en', false);
    const withOptional = permissionRationaleLines('en', true);
    expect(withOptional.length).toBe(base.length + 1);
    expect(withOptional.at(-1)).toMatch(/backup Steam Web API key/i);
  });
});

describe('steam-web-api-settings (H3 optional host)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
        request: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
      },
    });
  });

  it('does not store a key when optional host permission is denied', async () => {
    vi.mocked(chrome.permissions.request).mockResolvedValue(false);
    const { saveSteamWebApiKey, STEAM_WEB_API_KEY_STORAGE_KEY } = await import(
      './steam-web-api-settings.js'
    );

    const result = await saveSteamWebApiKey('abc123');
    expect(result).toEqual({ ok: false, reason: 'permission_denied' });
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ [STEAM_WEB_API_KEY_STORAGE_KEY]: 'abc123' }),
    );
  });

  it('stores key only after optional host is granted', async () => {
    vi.mocked(chrome.permissions.request).mockResolvedValue(true);
    const { saveSteamWebApiKey, STEAM_WEB_API_KEY_STORAGE_KEY } = await import(
      './steam-web-api-settings.js'
    );

    const result = await saveSteamWebApiKey('  secret-key  ');
    expect(result).toEqual({ ok: true });
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.steampowered.com/*'],
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [STEAM_WEB_API_KEY_STORAGE_KEY]: 'secret-key',
    });
  });

  it('clears key and revokes optional host', async () => {
    vi.mocked(chrome.permissions.contains).mockResolvedValue(true);
    const { clearSteamWebApiKey, STEAM_WEB_API_KEY_STORAGE_KEY } = await import(
      './steam-web-api-settings.js'
    );

    await clearSteamWebApiKey();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(
      STEAM_WEB_API_KEY_STORAGE_KEY,
    );
    expect(chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://api.steampowered.com/*'],
    });
  });
});
