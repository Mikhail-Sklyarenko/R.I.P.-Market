import type { ReactNode } from 'react';
import { ApiError } from '../api/types';
import { ERROR_MESSAGES } from '../utils/format';

type ErrorAlertVariant = 'error' | 'info' | 'warning';

type ErrorAlertProps = {
  error?: unknown;
  variant?: ErrorAlertVariant;
  title?: string;
  children?: ReactNode;
  'data-testid'?: string;
};

function resolveError(error: unknown): {
  message: string;
  code?: string;
  requestId?: string | null;
} {
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

  return { message, code, requestId };
}

export function ErrorAlert({
  error,
  variant = 'error',
  title,
  children,
  'data-testid': testId,
}: ErrorAlertProps) {
  if (!error && !children && !title) {
    return null;
  }

  const resolved = error ? resolveError(error) : null;
  const alertClass =
    variant === 'info'
      ? 'alert alert-info'
      : variant === 'warning'
        ? 'alert alert-warning'
        : 'alert alert-error';

  return (
    <div className={alertClass} role="alert" data-testid={testId}>
      {title ? <strong className="alert-title">{title}</strong> : null}
      {resolved ? <strong>{resolved.message}</strong> : null}
      {children ? <div className="alert-body">{children}</div> : null}
      {resolved?.code ? (
        <div className="alert-meta">Code: {resolved.code}</div>
      ) : null}
      {resolved?.requestId ? (
        <div className="alert-meta">Request ID: {resolved.requestId}</div>
      ) : null}
    </div>
  );
}
