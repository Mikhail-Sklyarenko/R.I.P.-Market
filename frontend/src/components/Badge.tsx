import type { ReactNode } from 'react';

type BadgeProps = {
  children: ReactNode;
  className?: string;
};

export function Badge({ children, className }: BadgeProps) {
  return <span className={['badge', className ?? ''].filter(Boolean).join(' ')}>{children}</span>;
}
