import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Loading, empty and error states.
 *
 * Skeletons mirror the real layout rather than showing a spinner, so the page
 * does not jump when data lands - which matters most on the card grid, where a
 * reflow of 60 tiles is the difference between "fast" and "janky" on a
 * mid-range phone.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      aria-busy
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-[63/88] w-full rounded-[var(--radius-tile)]" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function RowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div aria-busy className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[92px] w-full rounded-[var(--radius-card)]" />
      ))}
    </div>
  );
}

/**
 * An empty screen is an invitation to act, so every empty state names the next
 * step rather than only reporting absence.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'surface flex flex-col items-center rounded-[var(--radius-card)] px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? <div className="mb-4 text-faint">{icon}</div> : null}
      <h3 className="type-section mb-2">{title}</h3>
      <p className="type-meta max-w-[42ch]">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="surface rounded-[var(--radius-card)] border-[rgb(240_87_111/0.28)] px-6 py-10 text-center"
    >
      <h3 className="type-section mb-2 text-rose">{title}</h3>
      <p className="type-meta mx-auto max-w-[44ch]">{body}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
