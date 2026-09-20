'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { SearchIcon } from '@/components/layout/icons';
import { cn } from '@/lib/cn';

/**
 * Search inside one set, and only inside it.
 *
 * The global search covers 33,000 cards, which is the wrong tool when you
 * are looking at a 250-card set and want the Charizard in it: you get every
 * Charizard ever printed and have to find the right one. This filters the
 * list already on screen.
 *
 * The query lives in the URL like the other filters, so a search can be
 * shared and survives the back button, and it resets to page one - page 4 of
 * an unfiltered set is not page 4 of a search.
 *
 * Typing is debounced rather than sent per keystroke: this drives a server
 * query over a large table, and a request per character would queue behind
 * itself on a phone.
 */
export function SetCardSearch({ total }: { total: number }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fromUrl = searchParams.get('q') ?? '';
  const [value, setValue] = useState(fromUrl);

  // The URL can change without this input doing it - a back button, or a
  // filter alongside it clearing the query - so follow it when it does.
  const lastPushed = useRef(fromUrl);
  useEffect(() => {
    if (fromUrl !== lastPushed.current) {
      lastPushed.current = fromUrl;
      setValue(fromUrl);
    }
  }, [fromUrl]);

  useEffect(() => {
    if (value === lastPushed.current) return;
    const timer = setTimeout(() => {
      lastPushed.current = value;
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set('q', value.trim());
      else params.delete('q');
      params.delete('page');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, pathname, router, searchParams]);

  return (
    <div className="relative">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-faint"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t('set.searchInSet', { count: total })}
        aria-label={t('set.searchInSet', { count: total })}
        enterKeyHint="search"
        className={cn(
          'h-11 w-full rounded-[var(--radius-pill)] border border-hairline bg-[rgb(148_163_208/0.07)]',
          'pr-4 pl-11 text-[0.9375rem] text-paper placeholder:text-faint',
          'transition-colors outline-none',
          'focus:border-[rgb(139_92_246/0.5)] focus:bg-[rgb(139_92_246/0.08)]',
        )}
      />
    </div>
  );
}
