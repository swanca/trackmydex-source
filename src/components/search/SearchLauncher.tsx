'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/pricing/money';
import { SearchIcon } from '@/components/layout/icons';
import { cardImage } from '@/lib/images';

interface Suggestion {
  id: string;
  name: string;
  localId: string;
  setName: string;
  imageBaseUrl: string | null;
  price: { minor: number; currency: 'EUR' | 'USD' } | null;
}

/**
 * One search box, everywhere it is needed.
 *
 * Takes whatever the collector has in front of them: a card name, a set name,
 * a number like 025/165, or a mixture - the matcher requires every word to
 * match something, but each may match a different thing, so "pikachu TG"
 * finds the Trainer Gallery Pikachus.
 *
 * Suggestions appear as you type, through the same matcher the results page
 * uses, so the dropdown never promises a hit that Enter would not deliver.
 * The form still submits without JavaScript: the dropdown is an accelerator,
 * not the only route.
 */
export function SearchLauncher({
  autoFocus = false,
  className,
}: {
  autoFocus?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const listId = useId();

  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const container = useRef<HTMLDivElement>(null);

  // Debounced, and every in-flight request is abandoned when the next
  // keystroke arrives - otherwise a slow early response can land after a fast
  // later one and repaint the list with stale results.
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(query)}&locale=${locale}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const body = (await response.json()) as { hits: Suggestion[] };
        setSuggestions(body.hits);
        setActive(-1);
      } catch {
        // Aborted or offline: keep whatever is on screen.
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value, locale]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function submit(query: string) {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  function go(card: Suggestion) {
    setOpen(false);
    router.push(`/cards/${card.id}`);
  }

  const visible = open && suggestions.length > 0;

  return (
    <div ref={container} className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (active >= 0 && suggestions[active]) go(suggestions[active]);
          else submit(value);
        }}
      >
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (!visible) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, suggestions.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, -1));
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={t('search.placeholderRich')}
          aria-label={t('app.search')}
          enterKeyHint="search"
          className={cn(
            'h-12 w-full rounded-[var(--radius-pill)] border border-hairline bg-[rgb(148_163_208/0.07)]',
            'pr-4 pl-11 text-[0.9375rem] text-paper placeholder:text-faint',
            'transition-colors outline-none',
            'focus:border-[rgb(139_92_246/0.5)] focus:bg-[rgb(139_92_246/0.08)]',
          )}
        />
      </form>

      {visible ? (
        <ul
          id={listId}
          role="listbox"
          className="surface absolute inset-x-0 z-50 mt-2 max-h-[min(70vh,26rem)] overflow-y-auto rounded-[var(--radius-tile)] p-1.5 shadow-[0_18px_48px_-18px_rgb(0_0_0/0.8)]"
        >
          {suggestions.map((card, index) => (
            <li key={card.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(card)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors',
                  index === active ? 'bg-[rgb(148_163_208/0.12)]' : 'hover:bg-[rgb(148_163_208/0.08)]',
                )}
              >
                <span className="h-12 w-[34px] shrink-0 overflow-hidden rounded bg-[rgb(148_163_208/0.08)]">
                  {card.imageBaseUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a
                    // 34px thumbnail in a transient list; next/image would add
                    // an optimisation round trip per keystroke.
                    <img
                      src={cardImage(card.imageBaseUrl, 'low') ?? undefined}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-medium text-paper">
                    {card.name}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-faint">
                    {card.setName} · {card.localId}
                  </span>
                </span>
                {card.price ? (
                  <span className="tnum shrink-0 text-[0.8125rem] font-semibold text-mint">
                    {formatMoney(card.price, locale)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
