'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { SearchIcon } from '@/components/layout/icons';
import { SegmentedControl } from '@/components/ui/Field';
import { CardArt } from '@/components/cards/CardArt';
import { formatMoney, type Money } from '@/lib/pricing/money';
import { SetMark } from './SetMark';

export interface SetSummary {
  id: string;
  name: string;
  code: string | null;
  logoUrl: string | null;
  releaseDate: string | null;
  cardCount: number;
  ownedCount: number;
  eraName: string;
}

interface CardHit {
  id: string;
  name: string;
  localId: string;
  setName: string;
  imageBaseUrl: string | null;
  price: Money | null;
}

/**
 * Find a set, or a card, from the sets page.
 *
 * Sets are filtered in the browser: the whole list is already on the page,
 * it is a few hundred rows, and a round trip per keystroke would feel worse
 * than scrolling.
 *
 * Cards cannot work that way - there are 33,000 of them - so they come from
 * the suggestion endpoint, debounced. They are here because looking for a
 * card and looking for the set it is in are the same impulse: somebody who
 * types "dracaufeu" on this page wants the card, and being told "no set
 * matches" is a dead end when the card is one query away.
 *
 * With an empty query the server-rendered view underneath is shown
 * untouched, so the era bands, their progress and their artwork all survive.
 */
export function SetSearch({
  sets,
  children,
}: {
  sets: SetSummary[];
  children: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'oldest' | 'name'>('recent');
  const [cards, setCards] = useState<CardHit[]>([]);
  const [cardsFailed, setCardsFailed] = useState(false);

  const needle = query.trim();
  const searching = needle.length > 0;

  const results = useMemo(() => {
    const lower = needle.toLowerCase();
    if (!lower) return [];

    const words = lower.split(/\s+/);
    const matched = sets.filter((set) => {
      const haystack = `${set.name} ${set.code ?? ''} ${set.id} ${set.eraName}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });

    return [...matched].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const left = a.releaseDate ?? '';
      const right = b.releaseDate ?? '';
      return sort === 'oldest' ? left.localeCompare(right) : right.localeCompare(left);
    });
  }, [needle, sets, sort]);

  useEffect(() => {
    if (needle.length < 2) {
      setCards([]);
      setCardsFailed(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(needle)}&locale=${locale}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          /**
           * Say so rather than showing nothing.
           *
           * Silently swallowing this meant a rate-limited or failed lookup
           * looked exactly like "there are no cards called that", which is
           * the worst possible answer: it is wrong and it is unarguable.
           */
          setCards([]);
          setCardsFailed(true);
          return;
        }
        const body = (await response.json()) as { hits: CardHit[] };
        setCards(body.hits);
        setCardsFailed(false);
      } catch (cause) {
        // An abort is this effect cleaning up after itself, not a failure.
        if ((cause as { name?: string })?.name === 'AbortError') return;
        setCards([]);
        setCardsFailed(true);
      }
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [needle, locale]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('sets.searchPlaceholder')}
            aria-label={t('sets.searchPlaceholder')}
            enterKeyHint="search"
            className={cn(
              'h-12 w-full rounded-[var(--radius-pill)] border border-hairline bg-[rgb(148_163_208/0.07)]',
              'pr-4 pl-11 text-[0.9375rem] text-paper placeholder:text-faint',
              'transition-colors outline-none',
              'focus:border-[rgb(139_92_246/0.5)] focus:bg-[rgb(139_92_246/0.08)]',
            )}
          />
        </div>

        {searching && results.length > 0 ? (
          <SegmentedControl
            label={t('sets.sortBy')}
            value={sort}
            onChange={(value) => setSort(value as typeof sort)}
            options={[
              { value: 'recent', label: t('sets.sortRecent') },
              { value: 'oldest', label: t('sets.sortOldest') },
              { value: 'name', label: t('collection.sortName') },
            ]}
          />
        ) : null}
      </div>

      {searching ? (
        results.length === 0 && cards.length === 0 && !cardsFailed ? (
          <p className="type-meta py-8 text-center text-[0.875rem]">
            {t('search.noResultsBody')}
          </p>
        ) : (
          <div className="space-y-5">
            {results.length > 0 ? (
              <section className="space-y-2">
                <h2 className="type-eyebrow">{t('search.setsTab')}</h2>
                <ul className="space-y-2">
                  {results.map((set) => (
                    <li key={set.id}>
                      <Link
                        href={`/sets/${encodeURIComponent(set.id)}`}
                        className="surface-flat flex items-center gap-3 rounded-[var(--radius-tile)] px-3.5 py-3 transition-colors hover:bg-[var(--color-slate-hi)]"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center">
                          <SetMark
                            logoUrl={set.logoUrl}
                            code={set.code}
                            setId={set.id}
                            name={set.name}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.875rem] font-semibold text-paper">
                            {set.name}
                          </span>
                          <span className="block truncate text-[0.6875rem] text-faint">
                            {set.eraName}
                            {set.releaseDate ? ` · ${set.releaseDate.slice(0, 4)}` : ''}
                          </span>
                        </span>
                        <span className="tnum shrink-0 text-[0.8125rem] text-muted">
                          {set.ownedCount}/{set.cardCount}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {cardsFailed ? (
              <p className="type-meta rounded-xl border border-[rgb(245_181_68/0.28)] bg-[rgb(245_181_68/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-amber">
                {t('search.cardsUnavailable')}
              </p>
            ) : null}

            {cards.length > 0 ? (
              <section className="space-y-2">
                <h2 className="type-eyebrow">{t('search.cardsTab')}</h2>
                <ul className="space-y-2">
                  {cards.map((card) => (
                    <li key={card.id}>
                      <Link
                        href={`/cards/${encodeURIComponent(card.id)}`}
                        className="surface-flat flex items-center gap-3 rounded-[var(--radius-tile)] px-3.5 py-2.5 transition-colors hover:bg-[var(--color-slate-hi)]"
                      >
                        <span className="w-9 shrink-0">
                          <CardArt imageBaseUrl={card.imageBaseUrl} alt="" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.875rem] font-semibold text-paper">
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
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )
      ) : (
        children
      )}
    </div>
  );
}
