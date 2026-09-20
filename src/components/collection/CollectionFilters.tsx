'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { Input, SegmentedControl, Select } from '@/components/ui/Field';
import { Sheet } from '@/components/ui/Sheet';
import { FilterIcon } from '@/components/layout/icons';
import { cn } from '@/lib/cn';

export interface FacetOption {
  value: string;
  label: string;
}

/**
 * Collection filters.
 *
 * On a phone, filters belong in a bottom sheet: putting six selects above the
 * grid would push the content the user came for off the screen. Sort stays
 * outside the sheet because it is the control people change most often.
 *
 * Facet options come from the user's own rows, so the menus never offer a
 * language or rarity that would return nothing.
 */
export function CollectionFilters({
  facets,
  labels,
}: {
  facets: {
    languages: FacetOption[];
    conditions: FacetOption[];
    rarities: FacetOption[];
    variants: FacetOption[];
    sets: FacetOption[];
  };
  labels: {
    filters: string;
    apply: string;
    clear: string;
    language: string;
    condition: string;
    set: string;
    rarity: string;
    variant: string;
    price: string;
    sort: string;
    sortValue: string;
    sortRecent: string;
    sortName: string;
    sortNumber: string;
    all: string;
  };
}) {
  // `applied` is pluralised and count-dependent, so it is read from the client
  // hook: a server component cannot pass a function across the boundary.
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const current = {
    lang: searchParams.get('lang') ?? '',
    cond: searchParams.get('cond') ?? '',
    set: searchParams.get('set') ?? '',
    rarity: searchParams.get('rarity') ?? '',
    variant: searchParams.get('variant') ?? '',
    min: searchParams.get('min') ?? '',
    max: searchParams.get('max') ?? '',
    sort: searchParams.get('sort') ?? 'value',
  };

  const [draft, setDraft] = useState(current);
  const activeCount = ['lang', 'cond', 'set', 'rarity', 'variant', 'min', 'max'].filter(
    (key) => current[key as keyof typeof current],
  ).length;

  function push(next: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <SegmentedControl
        label={labels.sort}
        value={current.sort}
        onChange={(value) => push({ ...current, sort: value })}
        options={[
          { value: 'value', label: labels.sortValue },
          { value: 'recent', label: labels.sortRecent },
          { value: 'name', label: labels.sortName },
          { value: 'number', label: labels.sortNumber },
        ]}
        className="min-w-0 flex-1"
      />

      <button
        type="button"
        onClick={() => {
          setDraft(current);
          setOpen(true);
        }}
        className={cn(
          'flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 text-[0.8125rem] font-medium transition-colors',
          activeCount > 0
            ? 'border-[rgb(139_92_246/0.4)] bg-[rgb(139_92_246/0.16)] text-paper'
            : 'border-hairline text-muted hover:text-paper',
        )}
      >
        <FilterIcon className="size-4" />
        {activeCount > 0 ? t('search.filtersApplied', { count: activeCount }) : labels.filters}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={labels.filters}
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const cleared = { ...current, lang: '', cond: '', set: '', rarity: '', variant: '', min: '', max: '' };
                setDraft(cleared);
                push(cleared);
                setOpen(false);
              }}
            >
              {labels.clear}
            </Button>
            <Button
              fullWidth
              onClick={() => {
                push(draft);
                setOpen(false);
              }}
            >
              {labels.apply}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FacetSelect
            label={labels.language}
            all={labels.all}
            value={draft.lang}
            options={facets.languages}
            onChange={(value) => setDraft({ ...draft, lang: value })}
          />
          <FacetSelect
            label={labels.condition}
            all={labels.all}
            value={draft.cond}
            options={facets.conditions}
            onChange={(value) => setDraft({ ...draft, cond: value })}
          />
          <FacetSelect
            label={labels.set}
            all={labels.all}
            value={draft.set}
            options={facets.sets}
            onChange={(value) => setDraft({ ...draft, set: value })}
          />
          <FacetSelect
            label={labels.rarity}
            all={labels.all}
            value={draft.rarity}
            options={facets.rarities}
            onChange={(value) => setDraft({ ...draft, rarity: value })}
          />
          <FacetSelect
            label={labels.variant}
            all={labels.all}
            value={draft.variant}
            options={facets.variants}
            onChange={(value) => setDraft({ ...draft, variant: value })}
          />

          <fieldset>
            <legend className="mb-1.5 text-[0.8125rem] font-medium text-muted">
              {labels.price}
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                aria-label={`${labels.price} min`}
                value={draft.min}
                onChange={(event) => setDraft({ ...draft, min: event.target.value })}
              />
              <Input
                type="number"
                inputMode="decimal"
                placeholder="∞"
                aria-label={`${labels.price} max`}
                value={draft.max}
                onChange={(event) => setDraft({ ...draft, max: event.target.value })}
              />
            </div>
          </fieldset>
        </div>
      </Sheet>
    </div>
  );
}

function FacetSelect({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string;
  all: string;
  value: string;
  options: FacetOption[];
  onChange: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <Select label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
