import { describe, expect, it } from 'vitest';
import { humanizePairError } from './humanize-pair-error.js';

describe('humanizePairError', () => {
  it('hides Vite SW window/document artifacts', () => {
    expect(humanizePairError('window is not defined', 'ru')).toMatch(
      /Перезагрузите расширение/,
    );
    expect(humanizePairError('document is not defined', 'en')).toMatch(
      /Reload it on chrome:\/\/extensions/,
    );
  });

  it('maps network failures', () => {
    expect(humanizePairError('Failed to fetch', 'ru')).toMatch(/Нет связи/);
    expect(humanizePairError('NetworkError when attempting to fetch', 'en')).toMatch(
      /Cannot reach/,
    );
  });

  it('maps handshake HTTP statuses', () => {
    expect(humanizePairError('Handshake failed: 503', 'ru')).toMatch(/временно/);
    expect(humanizePairError('Handshake failed: 401', 'en')).toMatch(/expired/);
  });

  it('passes through unknown messages', () => {
    expect(humanizePairError('DEVICE_MISMATCH', 'ru')).toBe('DEVICE_MISMATCH');
  });
});
