import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * Touch targets are never below 44px in `md`/`lg`: this app is used one-handed
 * while holding a binder in the other hand.
 */
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-[0.8125rem] gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-5 text-[0.9375rem] gap-2 rounded-2xl',
};

const VARIANTS: Record<Variant, string> = {
  primary:
    'text-white bg-[linear-gradient(100deg,var(--color-violet),var(--color-azure))] ' +
    'shadow-[0_8px_28px_-12px_rgb(99_102_241/0.9)] hover:brightness-110 active:brightness-95',
  secondary:
    'text-paper bg-slate-hi border border-hairline hover:bg-[var(--color-slate-press)] active:bg-[var(--color-slate-press)]',
  ghost: 'text-muted hover:text-paper hover:bg-[rgb(148_163_208/0.08)]',
  danger: 'text-rose border border-[rgb(240_87_111/0.32)] bg-[rgb(240_87_111/0.08)] hover:bg-[rgb(240_87_111/0.14)]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap',
        'transition-[filter,background-color,transform] duration-150 active:scale-[0.98]',
        'disabled:opacity-45 disabled:pointer-events-none',
        SIZES[size],
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
    />
  );
}

/**
 * Compact icon-only control. Used for the quantity stepper and toolbar actions,
 * where a label would cost more room than it earns.
 */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-xl',
        'text-muted transition-colors hover:text-paper hover:bg-[rgb(148_163_208/0.1)]',
        'disabled:opacity-40 disabled:pointer-events-none',
        className,
      )}
    >
      {children}
    </button>
  );
}
