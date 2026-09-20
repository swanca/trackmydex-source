import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Surface({
  className,
  children,
  as: Tag = 'div',
}: {
  className?: string;
  children: ReactNode;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <Tag className={cn('surface rounded-[var(--radius-card)]', className)}>{children}</Tag>;
}

/**
 * Section heading with an optional trailing action.
 *
 * The eyebrow is monospaced and tiny on purpose: it labels a region without
 * competing with the set names and card art, which are what the eye should land
 * on first.
 */
export function SectionHeader({
  title,
  eyebrow,
  action,
  className,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-4 px-1', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="type-eyebrow mb-1">{eyebrow}</p> : null}
        <h2 className="type-section truncate">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Label + value pair used across the card detail and set header. */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'accent';
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="type-eyebrow mb-1.5">{label}</p>
      <p
        className={cn(
          'tnum truncate font-display text-[1.375rem] leading-none font-bold tracking-[-0.02em]',
          tone === 'accent' && 'accent-gradient',
        )}
      >
        {value}
      </p>
      {hint ? <p className="type-meta mt-1.5 truncate text-xs">{hint}</p> : null}
    </div>
  );
}
