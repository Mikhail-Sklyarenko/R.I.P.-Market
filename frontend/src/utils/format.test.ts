import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ERROR_MESSAGES,
  formatTradeStatus,
  formatUserRole,
  formatUserStatus,
  getSteamCallbackMessage,
} from './format.ts';

describe('format utils', () => {
  it('maps user-facing error codes to Russian messages', () => {
    assert.match(ERROR_MESSAGES.INSUFFICIENT_BALANCE, /средств/i);
    assert.match(ERROR_MESSAGES.FORBIDDEN, /прав/i);
    assert.match(ERROR_MESSAGES.INTERNAL_ERROR, /ошибка/i);
  });

  it('formats user role and status labels', () => {
    assert.equal(formatUserRole('SELLER'), 'Продавец');
    assert.equal(formatUserStatus('ACTIVE'), 'Активен');
  });

  it('formats trade status labels in Russian', () => {
    assert.equal(formatTradeStatus('CONFIRMED'), 'Обмен подтверждён');
  });

  it('resolves steam callback messages from error codes', () => {
    assert.equal(
      getSteamCallbackMessage('STEAM_NOT_LINKED', null),
      ERROR_MESSAGES.STEAM_NOT_LINKED,
    );
  });
});
