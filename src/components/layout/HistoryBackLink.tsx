'use client';

import { useRouter } from '@/i18n/routing';
import { ChevronLeftIcon } from './icons';

/**
 * Goes back to the actual grid the visitor came from. The fallback keeps a
 * direct visit to a card useful without inventing a history entry.
 */
export function HistoryBackLink({
  fallbackHref,
  label,
}: {
  fallbackHref: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="mb-2 -ml-1.5 inline-flex items-center gap-1 rounded-lg py-1 pr-2 pl-1 text-[0.8125rem] text-muted transition-colors hover:text-paper"
    >
      <ChevronLeftIcon className="size-4" />
      {label}
    </button>
  );
}
