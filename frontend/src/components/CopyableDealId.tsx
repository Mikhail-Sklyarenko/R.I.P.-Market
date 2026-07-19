import { useState } from 'react';

type CopyableDealIdProps = {
  id: string;
  /** Compact row for tables: short id + copy. */
  compact?: boolean;
  className?: string;
  testId?: string;
};

function shortDealId(id: string): string {
  if (id.length <= 10) {
    return id;
  }
  return `${id.slice(0, 8)}…`;
}

export function CopyableDealId({
  id,
  compact = false,
  className,
  testId = 'copyable-deal-id',
}: CopyableDealIdProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  if (compact) {
    return (
      <div
        className={['copyable-deal-id', 'copyable-deal-id-compact', className]
          .filter(Boolean)
          .join(' ')}
        data-testid={testId}
      >
        <code className="copyable-deal-id-value" title={id}>
          {shortDealId(id)}
        </code>
        <button
          type="button"
          className="copyable-deal-id-btn"
          onClick={() => void handleCopy()}
          data-testid={`${testId}-copy`}
        >
          {copied ? 'Скопировано' : 'ID'}
        </button>
      </div>
    );
  }

  return (
    <div
      className={['copyable-deal-id', className].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      <span className="copyable-deal-id-label">ID сделки</span>
      <div className="copyable-deal-id-row">
        <code className="copyable-deal-id-value" title={id}>
          {id}
        </code>
        <button
          type="button"
          className="button ghost sm"
          onClick={() => void handleCopy()}
          data-testid={`${testId}-copy`}
        >
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>
      <p className="muted small copyable-deal-id-hint">
        Нужен для обращения в поддержку.
      </p>
    </div>
  );
}
