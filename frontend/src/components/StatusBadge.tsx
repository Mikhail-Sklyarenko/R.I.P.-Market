import { Badge } from './Badge';

type StatusBadgeProps = {
  status: string;
  label?: string;
};

function statusToClass(status: string): string {
  return `badge-${status.toLowerCase().replace(/-/g, '_')}`;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return <Badge className={statusToClass(status)}>{label ?? status}</Badge>;
}
