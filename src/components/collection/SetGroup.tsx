'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/routing';
import type { CollectionSetGroup, GroupedCard } from '@/server/services/collection-groups';
import { formatMoney, type Money } from '@/lib/pricing/money';
import { CardArt } from '@/components/cards/CardArt';
import { QuantityStepper } from './QuantityStepper';
import { SetMark } from '@/components/sets/SetMark';
import { cn } from '@/lib/cn';

type Filter = 'all' | 'owned' | 'missing';
type Sort = 'number' | 'price-asc' | 'price-desc';

interface MissingCard {
  id: string;
  localId: string;
  name: string;
  imageBaseUrl: string | null;
  quantity: number;
  defaultVariantId: string | null;
  price: Money | null;
}

export interface SetGroupLabels {
  ownedOfSet: string;
  copies?: string;
  all: string;
  owned: string;
  missing: string;
  sort: string;
  sortNumber: string;
  sortPriceAscending: string;
  sortPriceDescending: string;
  add: string;
  remove: string;
  quantity: string;
  loading: string;
  error: string;
  empty: string;
}

/** A collection drawer with controls scoped to this set only. */
export function SetGroup({
  group,
  locale,
  cardLanguage,
  labels,
  defaultOpen = false,
}: {
  group: CollectionSetGroup;
  locale: string;
  cardLanguage: string;
  labels: SetGroupLabels;
  defaultOpen?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('owned');
  const [sort, setSort] = useState<Sort>('number');
  const [missing, setMissing] = useState<MissingCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (filter === 'owned' || missing !== null) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ setId: group.setId, ownership: 'missing', locale });

    fetch(`/api/collection/set-cards?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed');
        return (await response.json()) as { cards: MissingCard[] };
      })
      .then((result) => setMissing(result.cards))
      .catch((cause) => {
        if ((cause as Error).name !== 'AbortError') setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [filter, group.setId, locale, missing]);

  const cards = useMemo(() => {
    const owned = group.cards.map((card) => ({ kind: 'owned' as const, card }));
    const absent = (missing ?? []).map((card) => ({ kind: 'missing' as const, card }));
    const visible = filter === 'owned' ? owned : filter === 'missing' ? absent : [...owned, ...absent];

    return visible.sort((left, right) => {
      if (sort === 'number') {
        return left.card.localId.localeCompare(right.card.localId, locale, { numeric: true });
      }
      const leftPrice = ('unitValue' in left.card ? left.card.unitValue : left.card.price)?.minor ?? null;
      const rightPrice = ('unitValue' in right.card ? right.card.unitValue : right.card.price)?.minor ?? null;
      if (leftPrice === null) return 1;
      if (rightPrice === null) return -1;
      return sort === 'price-asc' ? leftPrice - rightPrice : rightPrice - leftPrice;
    });
  }, [filter, group.cards, locale, missing, sort]);

  return (
    <details open={defaultOpen} className="surface overflow-hidden rounded-[var(--radius-tile)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[rgb(148_163_208/0.05)]">
        <span className="flex size-10 shrink-0 items-center justify-center">
          <SetMark logoUrl={group.setLogoUrl} code={group.setCode} setId={group.setId} name={group.setName} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.875rem] font-semibold text-paper">{group.setName}</span>
          <span className="block text-[0.6875rem] text-faint">
            {labels.ownedOfSet}{labels.copies ? ` · ${labels.copies}` : ''}
          </span>
        </span>
        <span className="tnum shrink-0 text-right text-[0.875rem] font-bold text-paper">{formatMoney(group.value, locale)}</span>
        <svg viewBox="0 0 20 20" aria-hidden className="size-4 shrink-0 text-faint transition-transform [details[open]_&]:rotate-180">
          <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <div className="border-t border-hairline p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-xl border border-hairline bg-[rgb(148_163_208/0.06)] p-1">
            {(['all', 'owned', 'missing'] as const).map((value) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={cn('rounded-lg px-2.5 py-1.5 text-[0.75rem] font-semibold transition-colors', filter === value ? 'bg-violet text-white' : 'text-muted hover:text-paper')}>
                {labels[value]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[0.75rem] text-muted">
            <span>{labels.sort}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="rounded-xl border border-hairline bg-surface px-2.5 py-1.5 text-paper">
              <option value="number">{labels.sortNumber}</option>
              <option value="price-asc">{labels.sortPriceAscending}</option>
              <option value="price-desc">{labels.sortPriceDescending}</option>
            </select>
          </label>
        </div>

        {loading ? <p className="type-meta py-6 text-center">{labels.loading}</p> : null}
        {error ? <p className="py-6 text-center text-sm text-rose">{labels.error}</p> : null}
        {!loading && !error && cards.length === 0 ? <p className="type-meta py-6 text-center">{labels.empty}</p> : null}

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((item) => {
            const owned = item.kind === 'owned';
            const card = item.card;
            const name = owned ? (card as GroupedCard).cardName : (card as MissingCard).name;
            const href = owned ? (card as GroupedCard).cardId : card.id;
            const variantId = owned ? (card as GroupedCard).variantId : (card as MissingCard).defaultVariantId;
            const price = owned ? (card as GroupedCard).value : (card as MissingCard).price;
            const language = owned ? (card as GroupedCard).language : cardLanguage;
            const condition = owned ? (card as GroupedCard).condition : 'near_mint';

            return (
              <li key={`${item.kind}-${card.id}`}>
                <Link href={`/cards/${href}`} className="block">
                  <CardArt imageBaseUrl={card.imageBaseUrl} alt={name} sizes="160px" />
                  <p className="mt-1.5 truncate text-[0.75rem] font-medium text-paper">{name}</p>
                  <p className="type-code truncate text-faint">{card.localId}</p>
                  {price ? <p className="tnum text-[0.75rem] font-semibold text-mint">{formatMoney(price, locale)}</p> : null}
                </Link>
                {variantId ? (
                  <QuantityStepper
                    cardVariantId={variantId}
                    language={language}
                    condition={condition}
                    quantity={card.quantity}
                    size="sm"
                    className="mt-1.5"
                    labels={{ add: labels.add, remove: labels.remove, count: `${labels.quantity}: ${card.quantity}` }}
                    onChange={(next) => {
                      if (item.kind === 'missing' && next > 0) setMissing((current) => current?.filter((entry) => entry.id !== card.id) ?? null);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
