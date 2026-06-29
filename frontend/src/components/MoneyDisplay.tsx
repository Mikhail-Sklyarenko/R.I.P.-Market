import { formatUsdFromMinor } from '../utils/format';

type MoneyDisplayProps = {
  minor: string | number;
  strong?: boolean;
  className?: string;
};

export function MoneyDisplay({ minor, strong = false, className }: MoneyDisplayProps) {
  const classes = [
    'money-display',
    strong ? 'money-display-strong' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={classes}>{formatUsdFromMinor(minor)}</span>;
}
