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

interface Option {
  value: string;
  label: string;
}

/**
 * Sealed catalogue filters.
 *
 * Search sits outside the sheet because 7,500 products is too many to browse
 * without it, and typing a box name is how most people will arrive. Shape and
 * language go in the sheet, matching how the card collection filters behave.
 */
export function SealedFilters({
  kinds,
  languages,
}: {
  kinds: Option[];
  languages: Option[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const current = {
    q: searchParams.get('q') ?? '',
    kind: searchParams.get('kind') ?? '',
    lang: searchParams.get('lang') ?? '',
    sort: searchParams.get('sort') ?? 'value',
  };

  const [draft, setDraft] = useState(current);
  const [search, setSearch] = useState(current.q);
  const activeCount = ['kind', 'lang'].filter((key) => current[key as keyof typeof current]).length;

  function push(next: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    // Any filter change invalidates the page number: page 7 of the old result
    // set is rarely page 7 of the new one.
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          push({ ...current, q: search });
        }}
        className="flex gap-2"
      >
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('sealed.searchPlaceholder')}
          aria-label={t('app.search')}
          className="flex-1"
        />
        <Button type="submit" variant="secondary">
          {t('app.search')}
        </Button>
      </form>

      <div className="flex items-center gap-2">
        <SegmentedControl
          label={t('collection.sort')}
          value={current.sort}
          onChange={(value) => push({ ...current, sort: value })}
          options={[
            { value: 'value', label: t('collection.sortValue') },
            { value: 'recent', label: t('collection.sortRecent') },
            { value: 'name', label: t('collection.sortName') },
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
          {activeCount > 0 ? t('search.filtersApplied', { count: activeCount }) : t('app.filters')}
        </button>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('app.filters')}
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const cleared = { ...current, kind: '', lang: '' };
                setDraft(cleared);
                push(cleared);
                setOpen(false);
              }}
            >
              {t('app.clear')}
            </Button>
            <Button
              fullWidth
              onClick={() => {
                push(draft);
                setOpen(false);
              }}
            >
              {t('app.apply')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label={t('sealed.kindLabel')}
            value={draft.kind}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
          >
            <option value="">{t('collection.all')}</option>
            {kinds.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            label={t('collection.language')}
            value={draft.lang}
            onChange={(event) => setDraft({ ...draft, lang: event.target.value })}
          >
            <option value="">{t('collection.all')}</option>
            {languages.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </Sheet>
    </div>
  );
}
