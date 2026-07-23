import type { ReactNode } from 'react';
import { ApiError } from '../api/types';
import { useLocale } from '../i18n';
import { formatApiErrorMessage } from '../utils/format';
import type { Locale } from '../i18n/types.ts';

type ErrorAlertVariant = 'error' | 'info' | 'warning';

type ErrorAlertProps = {
  error?: unknown;
  variant?: ErrorAlertVariant;
  title?: string;
  children?: ReactNode;
  'data-testid'?: string;
};

function resolveError(
  error: unknown,
  locale: Locale,
  genericMessage: string,
): {
  message: string;
  code?: string;
  requestId?: string | null;
} {
  let message = genericMessage;
  let code: string | undefined;
  let requestId: string | null | undefined;

  if (error instanceof ApiError) {
    code = error.code;
    requestId = error.requestId;
    message = formatApiErrorMessage(error.code, locale) ?? error.message;
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
  const { t, locale } = useLocale();
  if (!error && !children && !title) {
    return null;
  }

  const resolved = error
    ? resolveError(error, locale, t('errorAlert.genericMessage'))
    : null;
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
        <div className="alert-meta">{t('errorAlert.codeLabel', { code: resolved.code })}</div>
      ) : null}
      {resolved?.requestId ? (
        <div className="alert-meta">
          {t('errorAlert.requestIdLabel', { id: resolved.requestId })}
        </div>
      ) : null}
    </div>
  );
}
