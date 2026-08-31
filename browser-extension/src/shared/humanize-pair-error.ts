/**
 * Maps raw pair/handshake failures to short user-facing copy.
 * Hides Vite SW artifacts like "window is not defined" from UI.
 */
export function humanizePairError(
  raw: string,
  locale: 'ru' | 'en' = 'ru',
): string {
  const message = raw.trim();
  const lower = message.toLowerCase();

  const isRu = locale !== 'en';

  if (
    lower.includes('window is not defined') ||
    lower.includes('document is not defined') ||
    lower.includes('vite:preload')
  ) {
    return isRu
      ? 'Сбой расширения. Перезагрузите расширение на chrome://extensions и нажмите «Подключить» снова.'
      : 'Extension glitch. Reload it on chrome://extensions, then connect again.';
  }

  if (
    lower === 'failed to fetch' ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('network request failed')
  ) {
    return isRu
      ? 'Нет связи с сервером R.I.P. Проверьте интернет / VPN и обновите страницу.'
      : 'Cannot reach the R.I.P server. Check your network/VPN and reload the page.';
  }

  if (/handshake failed:\s*5\d{2}/i.test(message)) {
    return isRu
      ? 'Сервер временно недоступен. Попробуйте через минуту.'
      : 'Server temporarily unavailable. Try again in a minute.';
  }

  if (/handshake failed:\s*401/i.test(message)) {
    return isRu
      ? 'Сессия сайта устарела. Выйдите и войдите через Steam снова.'
      : 'Site session expired. Sign out and log in with Steam again.';
  }

  if (/handshake failed:\s*403/i.test(message)) {
    return isRu
      ? 'Подключение расширения запрещено для этого аккаунта.'
      : 'Extension pairing is not allowed for this account.';
  }

  if (/handshake failed:\s*4\d{2}/i.test(message)) {
    return isRu
      ? 'Не удалось подключить расширение (ошибка сервера). Обновите страницу и попробуйте снова.'
      : 'Could not connect the extension (server error). Reload and try again.';
  }

  return message || (isRu ? 'Не удалось подключить расширение' : 'Failed to connect the extension');
}
