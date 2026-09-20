'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
import { SearchIcon } from '@/components/layout/icons';
import { cn } from '@/lib/cn';

/**
 * Search box.
 *
 * Debounced at 280ms and pushed into the URL, so the server does the querying
 * and a result page stays shareable. `replace` rather than `push` while typing,
 * otherwise every keystroke becomes a browser-history entry and Back stops
 * working the way people expect.
 */
export function SearchInput({
  placeholder,
  hint,
  label,
  autoFocus = false,
}: {
  placeholder: string;
  hint?: string;
  label: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) params.set('q', next.trim());
      else params.delete('q');
      params.delete('page');
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, 280);
  }

  return (
    <div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-faint" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          aria-label={label}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-12 w-full rounded-2xl border border-hairline bg-[rgb(148_163_208/0.06)] pr-10 pl-11',
            'text-[0.9375rem] text-paper placeholder:text-faint',
            'transition-colors focus:border-[rgb(59_130_246/0.6)] focus:outline-none',
            'focus-visible:outline-2 focus-visible:outline-azure focus-visible:outline-offset-2',
          )}
        />
        {pending ? (
          <span
            aria-hidden
            className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-[rgb(148_163_208/0.25)] border-t-[rgb(148_163_208/0.7)]"
          />
        ) : null}
      </div>
      {hint && !value ? <p className="mt-2 px-1 text-[0.75rem] text-faint">{hint}</p> : null}
    </div>
  );
}
