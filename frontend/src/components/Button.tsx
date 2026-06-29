import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'md' | 'sm';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = [
    'button',
    variant !== 'secondary' ? variant : 'secondary',
    size === 'sm' ? 'sm' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
