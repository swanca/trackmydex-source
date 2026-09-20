import type { ReactNode } from 'react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { ChevronLeftIcon } from './icons';

/**
 * Page header.
 *
 * Mirrors the reference's slim top bar: back affordance, a single title, and
 * at most two actions. It is not sticky - on a phone, a sticky header plus a
 * fixed bottom nav leaves too little room for the content between them.
 */
export function PageHeader({
  title,
  eyebrow,
  backHref,
  backLabel,
  actions,
  className,
}: {
  /** Optional: a page whose eyebrow already says everything needs no headline. */
  title?: string;
  eyebrow?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('px-5 pt-1 pb-3 lg:px-8 lg:pt-3', className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="mb-2 -ml-1.5 inline-flex items-center gap-1 rounded-lg py-1 pr-2 pl-1 text-[0.8125rem] text-muted transition-colors hover:text-paper"
        >
          <ChevronLeftIcon className="size-4" />
          {backLabel}
        </Link>
      ) : null}

      {/* Actions drop below the title on a phone. Held on one row they are
          `shrink-0`, so they win the fight for width and the title is the thing
          that gets clipped - which is exactly backwards. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          {eyebrow ? <p className="type-eyebrow mb-1.5">{eyebrow}</p> : null}
          {title ? <h1 className="type-title">{title}</h1> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

export function PageSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn('px-5 lg:px-8', className)}>{children}</section>;
}
