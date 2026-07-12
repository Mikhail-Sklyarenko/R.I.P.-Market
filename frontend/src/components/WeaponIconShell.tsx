import type { ReactNode } from 'react';

type WeaponIconShellProps = {
  variant: 'category' | 'model';
  children: ReactNode;
};

export function WeaponIconShell({ variant, children }: WeaponIconShellProps) {
  return (
    <span
      className={`weapon-icon-shell weapon-icon-shell-${variant}`}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
