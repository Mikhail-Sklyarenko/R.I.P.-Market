import { useState, type MouseEvent } from 'react';
import { useLocale } from '../i18n';

type CopyableDealIdProps = {
  id: string;
  /** Compact chip for tables: click the ID to copy. */
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
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  async function handleCopy(event?: MouseEvent) {
    event?.stopPropagation();
    event?.preventDefault();
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
      <button
        type="button"
        className={['copyable-deal-id', 'copyable-deal-id-compact', className]
          .filter(Boolean)
          .join(' ')}
        onClick={(event) => void handleCopy(event)}
        title={copied ? t('copyableDealId.copied') : t('copyableDealId.copyIdShort', { id })}
        aria-label={
          copied ? t('copyableDealId.copiedAria') : t('copyableDealId.copyIdAria', { id })
        }
        data-testid={testId}
      >
        <code
          className={[
            'copyable-deal-id-value',
            copied ? 'copyable-deal-id-value-copied' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {copied ? t('copyableDealId.copied') : shortDealId(id)}
        </code>
      </button>
    );
  }

  return (
    <div
      className={['copyable-deal-id', className].filter(Boolean).join(' ')}
      data-testid={testId}
    >
      <span className="copyable-deal-id-label">{t('copyableDealId.label')}</span>
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
          {copied ? t('copyableDealId.copied') : t('copyableDealId.copyButton')}
        </button>
      </div>
      <p className="muted small copyable-deal-id-hint">
        {t('copyableDealId.hint')}
      </p>
    </div>
  );
}
