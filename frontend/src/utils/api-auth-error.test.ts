import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../api/types.ts';
import { isUnauthorizedApiError } from './api-auth-error.ts';

describe('isUnauthorizedApiError', () => {
  it('detects UNAUTHORIZED ApiError by code', () => {
    assert.equal(
      isUnauthorizedApiError(
        new ApiError({
          code: 'UNAUTHORIZED',
          message: 'Session expired',
          statusCode: 401,
        }),
      ),
      true,
    );
  });

  it('detects 401 status even without code', () => {
    assert.equal(
      isUnauthorizedApiError(
        new ApiError({
          code: 'UNKNOWN_ERROR',
          message: 'Unauthorized',
          statusCode: 401,
        }),
      ),
      true,
    );
  });

  it('ignores Steam / business errors', () => {
    assert.equal(
      isUnauthorizedApiError(
        new ApiError({
          code: 'STEAM_RATE_LIMITED',
          message: 'Rate limited',
          statusCode: 429,
        }),
      ),
      false,
    );
    assert.equal(isUnauthorizedApiError(new Error('network')), false);
    assert.equal(isUnauthorizedApiError(null), false);
  });
});
