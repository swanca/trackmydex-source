'use client';

import { useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { SegmentedControl, Select } from '@/components/ui/Field';

/**
 * Filters for the most-valuable list.
 *
 * The floor is the important one and it is why this page exists rather than
 * an endless scroll: 33,000 cards ordered by price is not a list anybody
 * reads to the end, so it stops where the money does. The default of 50 is
 * high enough to be a shortlist and low enough that most collections have
 * something in it.
 *
 * Everything lives in the URL, so a view can be shared and the back button
 * works, and any change resets to page one.
 */
export function TopCardFilters({
  rarities,
  currency,
}: {
  rarities: string[];
  currency: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const current = {
    min: searchParams.get('min') ?? '50',
    rarity: searchParams.get('rarity') ?? '',
    own: searchParams.get('own') ?? 'all',
  };

  function push(next: Partial<typeof current>) {
    const merged = { ...current, ...next };
    const params = new URLSearchParams();
    if (merged.min && merged.min !== '50') params.set('min', merged.min);
    if (merged.rarity) params.set('rarity', merged.rarity);
    if (merged.own && merged.own !== 'all') params.set('own', merged.own);
    startTransition(() => {
      router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false });
    });
  }

  const symbol = currency === 'USD' ? '$' : '€';

  return (
    <div className="space-y-2">
      <SegmentedControl
        label={t('top.floor')}
        value={current.min}
        onChange={(value) => push({ min: value })}
        options={[
          { value: '10', label: `${symbol}10+` },
          { value: '50', label: `${symbol}50+` },
          { value: '100', label: `${symbol}100+` },
          { value: '500', label: `${symbol}500+` },
        ]}
      />

      <div className="flex flex-wrap items-end gap-2">
        <SegmentedControl
          label={t('collection.filterOwnership')}
          value={current.own}
          onChange={(value) => push({ own: value })}
          options={[
            { value: 'all', label: t('set.showAll') },
            { value: 'owned', label: t('set.showOwnedOnly') },
            { value: 'missing', label: t('set.showMissingOnly') },
          ]}
          className="min-w-0 flex-1"
        />

        {rarities.length > 0 ? (
          <Select
            label={t('collection.filterRarity')}
            value={current.rarity}
            onChange={(event) => push({ rarity: event.target.value })}
            className="min-w-0 flex-1"
          >
            <option value="">{t('collection.all')}</option>
            {rarities.map((rarity) => (
              <option key={rarity} value={rarity}>
                {rarity}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
    </div>
  );
}
