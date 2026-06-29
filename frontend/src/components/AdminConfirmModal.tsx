type AdminConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AdminConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  loading = false,
  onConfirm,
  onCancel,
}: AdminConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" data-testid="admin-reason-modal">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title">
        <h3 id="admin-confirm-title">{title}</h3>
        <p className="muted">{message}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            data-testid="admin-reason-modal-cancel"
            disabled={loading}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            data-testid="admin-reason-modal-confirm"
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
