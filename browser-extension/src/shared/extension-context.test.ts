import { describe, expect, it } from 'vitest';
import {
  isExtensionContextInvalidatedError,
  isExtensionContextValid,
  withExtensionContext,
} from './extension-context.js';

describe('extension-context', () => {
  it('detects invalidated message', () => {
    expect(
      isExtensionContextInvalidatedError(
        new Error('Extension context invalidated.'),
      ),
    ).toBe(true);
    expect(isExtensionContextInvalidatedError(new Error('network'))).toBe(
      false,
    );
  });

  it('reports runtime id presence', () => {
    expect(typeof isExtensionContextValid()).toBe('boolean');
  });

  it('returns fallback when run throws invalidated', async () => {
    const result = await withExtensionContext(async () => {
      throw new Error('Extension context invalidated');
    }, 'fallback');
    expect(result).toEqual({
      ok: false,
      invalidated: true,
      value: 'fallback',
    });
  });

  it('returns value on success when context is valid', async () => {
    const result = await withExtensionContext(async () => 'ok', 'fallback');
    if (isExtensionContextValid()) {
      expect(result).toEqual({ ok: true, value: 'ok' });
    } else {
      // Vitest/jsdom often has no chrome.runtime.id — treat as invalidated.
      expect(result).toEqual({
        ok: false,
        invalidated: true,
        value: 'fallback',
      });
    }
  });
});
