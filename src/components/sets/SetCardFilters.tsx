'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { SegmentedControl, Select } from '@/components/ui/Field';

/**
 * Sort and rarity for one set's card list.
 *
 * Both live in the URL, so a filtered view can be shared, bookmarked, and
 * returned to with the back button. Changing either resets to the first page:
 * page 7 of one ordering is not page 7 of another.
 *
 * The rarity menu is built from the rarities this set actually contains, so it
 * never offers a choice that returns nothing.
 */
export function SetCardFilters({ rarities }: { rarities: string[] }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const current = {
    sort: searchParams.get('sort') ?? 'number',
    rarity: searchParams.get('rarity') ?? '',
    own: searchParams.get('own') ?? '',
  };
  const [rarity, setRarity] = useState(current.rarity);

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
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label={t('sets.sortBy')}
        value={current.sort}
        onChange={(value) => push({ ...current, sort: value })}
        options={[
          { value: 'number', label: t('collection.sortNumber') },
          { value: 'price', label: t('collection.sortValue') },
          { value: 'name', label: t('collection.sortName') },
        ]}
        className="min-w-0 flex-1"
      />

      {rarities.length > 0 ? (
        <Select
          label={t('collection.filterRarity')}
          value={rarity}
          onChange={(event) => {
            setRarity(event.target.value);
            push({ ...current, rarity: event.target.value });
          }}
          className="min-w-[9rem]"
        >
          <option value="">{t('collection.all')}</option>
          {rarities.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  );
}
