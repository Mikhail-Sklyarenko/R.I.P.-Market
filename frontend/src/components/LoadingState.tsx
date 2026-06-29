type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="loading-state" role="status" aria-live="polite" data-testid="loading-state">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
