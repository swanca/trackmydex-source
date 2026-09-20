'use client';

import { useTransition } from 'react';
import { useRouter, usePathname } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { SegmentedControl, Select } from '@/components/ui/Field';
import type { CardLanguage } from '@/db/schema/enums';

/**
 * Set-page controls.
 *
 * Filter state lives in the URL, not in component state. That makes a filtered
 * set shareable and survivable across a refresh, and it means the server can
 * render exactly the rows asked for instead of shipping the whole set and
 * filtering in the browser - which is the difference between a 200-card set
 * feeling instant or janky on a mid-range phone.
 */
export function SetFilterBar({
  ownership,
  cardLanguage,
  availableLanguages,
  languageLabels,
  labels,
}: {
  ownership: 'all' | 'owned' | 'missing';
  cardLanguage: CardLanguage;
  availableLanguages: CardLanguage[];
  languageLabels: Record<string, string>;
  labels: {
    all: string;
    owned: string;
    missing: string;
    language: string;
    filters: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
    >
      <SegmentedControl
        label={labels.filters}
        value={ownership}
        onChange={(value) => update('own', value === 'all' ? '' : value)}
        options={[
          { value: 'all', label: labels.all },
          { value: 'owned', label: labels.owned },
          { value: 'missing', label: labels.missing },
        ]}
        className="flex-1"
      />

      {availableLanguages.length > 1 ? (
        <Select
          aria-label={labels.language}
          value={cardLanguage}
          onChange={(event) => update('lang', event.target.value)}
          className="h-9 w-auto min-w-[104px] text-[0.8125rem]"
        >
          {availableLanguages.map((language) => (
            <option key={language} value={language}>
              {languageLabels[language] ?? language}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  );
}
