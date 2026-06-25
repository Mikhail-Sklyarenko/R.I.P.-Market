import { ApiError } from '../api/types';
import { ERROR_MESSAGES } from '../utils/format';

type ErrorAlertProps = {
  error: unknown;
};

export function ErrorAlert({ error }: ErrorAlertProps) {
  if (!error) {
    return null;
  }

  let message = 'Something went wrong. Please try again.';
  let code: string | undefined;
  let requestId: string | null | undefined;

  if (error instanceof ApiError) {
    code = error.code;
    requestId = error.requestId;
    message = ERROR_MESSAGES[error.code] ?? error.message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="alert alert-error" role="alert">
      <strong>{message}</strong>
      {code ? <div className="alert-meta">Code: {code}</div> : null}
      {requestId ? <div className="alert-meta">Request ID: {requestId}</div> : null}
    </div>
  );
}
