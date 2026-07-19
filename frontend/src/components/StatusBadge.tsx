import { Badge } from './Badge';

type StatusBadgeProps = {
  status: string;
  label?: string;
  /** Sentence-case chip for dense tables (no uppercase shout). */
  compact?: boolean;
};

function statusToClass(status: string): string {
  return `badge-${status.toLowerCase().replace(/-/g, '_')}`;
}

export function StatusBadge({ status, label, compact = false }: StatusBadgeProps) {
  return (
    <Badge
      className={[statusToClass(status), compact ? 'badge-compact' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {label ?? status}
    </Badge>
  );
}
