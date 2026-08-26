import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatGuardWaitElapsed } from './guard-wait.ts';

describe('formatGuardWaitElapsed', () => {
  const now = Date.parse('2026-08-26T12:05:00.000Z');

  it('returns null without a start timestamp', () => {
    assert.equal(formatGuardWaitElapsed(null, now), null);
    assert.equal(formatGuardWaitElapsed(undefined, now), null);
  });

  it('formats minutes and seconds', () => {
    assert.equal(formatGuardWaitElapsed('2026-08-26T12:03:20.000Z', now), '1:40');
  });

  it('formats hours when elapsed ≥ 1h', () => {
    assert.equal(
      formatGuardWaitElapsed('2026-08-26T10:04:05.000Z', now),
      '2:00:55',
    );
  });
});
