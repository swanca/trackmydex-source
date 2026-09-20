'use client';

import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/**
 * Page stepper.
 *
 * Deliberately not infinite scroll: a collector working through a set needs to
 * be able to leave, come back and land in the same place, and an endless list
 * makes the footer and the bottom nav fight each other. The page number lives
 * in the URL for the same reason the filters do.
 */
export function Pagination({
  page,
  pageSize,
  total,
  labels,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  labels: { previous: string; next: string };
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  function goTo(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <nav className={cn('flex items-center justify-between gap-3 pt-2', className)}>
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
      >
        {labels.previous}
      </Button>

      <span className="tnum text-[0.8125rem] text-muted">
        {page} / {pageCount}
      </span>

      <Button
        variant="secondary"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => goTo(page + 1)}
      >
        {labels.next}
      </Button>
    </nav>
  );
}
