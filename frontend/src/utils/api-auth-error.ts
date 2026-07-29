import { ApiError } from '../api/types.ts';

/** True when the API rejected the JWT / session (not a Steam inventory failure). */
export function isUnauthorizedApiError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  return error.statusCode === 401 || error.code === 'UNAUTHORIZED';
}

export const AUTH_UNAUTHORIZED_EVENT = 'rip:auth-unauthorized';

export function emitAuthUnauthorized(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
}
