type AdminReasonModalProps = {
  open: boolean;
  title: string;
  message: string;
  reason: string;
  confirmLabel?: string;
  loading?: boolean;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  reasonTestId?: string;
};

export function AdminReasonModal({
  open,
  title,
  message,
  reason,
  confirmLabel = 'Confirm',
  loading = false,
  onReasonChange,
  onConfirm,
  onCancel,
  reasonTestId = 'admin-action-reason',
}: AdminReasonModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" data-testid="admin-reason-modal">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="admin-reason-title">
        <h3 id="admin-reason-title">{title}</h3>
        <p className="muted">{message}</p>
        <label className="field">
          <span>Reason</span>
          <textarea
            className="textarea"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            data-testid={reasonTestId}
            rows={3}
            placeholder="Required (min 3 characters)"
          />
        </label>
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
            disabled={loading || reason.trim().length < 3}
            onClick={onConfirm}
          >
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
