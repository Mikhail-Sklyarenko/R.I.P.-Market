import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isRetryableHttpStatus,
  isRetryableNetworkError,
} from '../api/network.ts';

describe('network retry helpers', () => {
  it('detects Failed to fetch and TypeError', () => {
    assert.equal(isRetryableNetworkError(new TypeError('Failed to fetch')), true);
    assert.equal(
      isRetryableNetworkError(new Error('Failed to fetch')),
      true,
    );
    assert.equal(isRetryableNetworkError(new Error('validation')), false);
  });

  it('retries gateway statuses', () => {
    assert.equal(isRetryableHttpStatus(503), true);
    assert.equal(isRetryableHttpStatus(404), false);
  });
});
