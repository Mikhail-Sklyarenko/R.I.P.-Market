/**
 * H3: Security UX — what we do / don't, and why each permission exists.
 * Steam Web API key is support-emergency only; api.steampowered.com is optional.
 */

export const STEAM_WEB_API_OPTIONAL_ORIGINS = [
  'https://api.steampowered.com/*',
] as const;

export type ExtensionPermissionId =
  | 'storage'
  | 'alarms'
  | 'tabs'
  | 'scripting'
  | 'cookies'
  | 'notifications'
  | 'host:steamcommunity'
  | 'host:platform'
  | 'optional:steampowered-api';

export type ExtensionPermissionRationale = {
  id: ExtensionPermissionId;
  required: boolean;
  purposeEn: string;
  purposeRu: string;
};

/** Manifest-required surfaces only — optional Steam API host is separate. */
export const EXTENSION_REQUIRED_PERMISSIONS: readonly ExtensionPermissionRationale[] =
  [
    {
      id: 'storage',
      required: true,
      purposeEn: 'Pairing session, locale, quiet-notify prefs (not your Steam password).',
      purposeRu:
        'Сессия подключения, язык, тихие уведомления (не пароль Steam).',
    },
    {
      id: 'alarms',
      required: true,
      purposeEn: 'Poll deal tasks on a calm interval while Chrome is open.',
      purposeRu: 'Спокойный опрос задач по сделкам, пока Chrome открыт.',
    },
    {
      id: 'tabs',
      required: true,
      purposeEn: 'Open / focus Steam trade and inventory tabs for your deals.',
      purposeRu: 'Открывать и фокусировать вкладки Steam под ваши сделки.',
    },
    {
      id: 'scripting',
      required: true,
      purposeEn: 'Autofill offer fields on Steam pages you already opened.',
      purposeRu: 'Подставлять поля оффера на страницах Steam, которые вы открыли.',
    },
    {
      id: 'cookies',
      required: true,
      purposeEn: 'Read Steam session cookies in this browser to load inventory safely.',
      purposeRu:
        'Читать cookies сессии Steam в этом браузере, чтобы загрузить инвентарь.',
    },
    {
      id: 'notifications',
      required: true,
      purposeEn: 'Quiet alerts when Guard / Accept / Mismatch needs you.',
      purposeRu: 'Тихие оповещения, когда нужен Guard / Accept / Mismatch.',
    },
    {
      id: 'host:steamcommunity',
      required: true,
      purposeEn: 'Work only on steamcommunity.com trade and inventory pages.',
      purposeRu: 'Работать только на страницах trade / inventory steamcommunity.com.',
    },
    {
      id: 'host:platform',
      required: true,
      purposeEn: 'Talk to R.I.P Market (p2pcs.ru / local) for pairing and deal status.',
      purposeRu:
        'Связь с R.I.P Market (p2pcs.ru / local) для подключения и статуса сделок.',
    },
  ];

export const EXTENSION_OPTIONAL_STEAM_API_PERMISSION: ExtensionPermissionRationale =
  {
    id: 'optional:steampowered-api',
    required: false,
    purposeEn:
      'Only if support asks you to add a backup Steam Web API key (inventory rate-limit fallback).',
    purposeRu:
      'Только если поддержка попросила запасной Steam Web API key (fallback при лимите инвентаря).',
  };

export type PrivacyTransparencyView = {
  title: string;
  doItems: string[];
  dontItems: string[];
};

export function buildPrivacyTransparency(
  locale: 'ru' | 'en',
): PrivacyTransparencyView {
  if (locale === 'en') {
    return {
      title: 'What we do',
      doItems: [
        'Help send and verify R.I.P Market deals on Steam pages you open.',
        'Use your Steam session in this Chrome — no password prompt from us.',
        'Ask only for permissions needed for deals (list under Advanced).',
      ],
      dontItems: [
        'Never auto-confirm Steam Guard or click Accept for you.',
        'No Steam Web API key for normal use — support emergency only.',
        'We do not sell your data or read unrelated browsing.',
      ],
    };
  }
  return {
    title: 'Что мы делаем',
    doItems: [
      'Помогаем отправлять и проверять сделки R.I.P Market на страницах Steam, которые вы открыли.',
      'Используем вашу сессию Steam в этом Chrome — пароль у нас не спрашиваем.',
      'Просим только права, нужные для сделок (список в «Дополнительно»).',
    ],
    dontItems: [
      'Никогда не подтверждаем Steam Guard и не жмём Accept за вас.',
      'Ключ Steam Web API обычным пользователям не нужен — только по запросу поддержки.',
      'Не продаём данные и не читаем посторонний браузинг.',
    ],
  };
}

export function privacyTransparencyHtml(view: PrivacyTransparencyView): string {
  const doList = view.doItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const dontList = view.dontItems
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');
  return `
    <p class="privacy-title">${escapeHtml(view.title)}</p>
    <ul class="privacy-list privacy-do">${doList}</ul>
    <p class="privacy-subtitle">${escapeHtml(
      view.title === 'What we do' ? 'What we never do' : 'Чего мы не делаем',
    )}</p>
    <ul class="privacy-list privacy-dont">${dontList}</ul>
  `;
}

export function permissionRationaleLines(
  locale: 'ru' | 'en',
  includeOptionalSteamApi = false,
): string[] {
  const rows = [
    ...EXTENSION_REQUIRED_PERMISSIONS,
    ...(includeOptionalSteamApi ? [EXTENSION_OPTIONAL_STEAM_API_PERMISSION] : []),
  ];
  return rows.map((row) =>
    locale === 'en' ? row.purposeEn : row.purposeRu,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
