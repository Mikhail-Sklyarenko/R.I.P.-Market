import { useLocale } from '../i18n';

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message }: LoadingStateProps) {
  const { t } = useLocale();
  return (
    <div className="loading-state" role="status" aria-live="polite" data-testid="loading-state">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{message ?? t('common.loading')}</span>
    </div>
  );
}
