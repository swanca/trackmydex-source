'use client';

import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
import { SegmentedControl } from '@/components/ui/Field';

/**
 * Ownership filter that writes to the URL.
 *
 * A thin wrapper over SegmentedControl so the search page itself can stay a
 * server component - only the three-button control needs to be interactive.
 */
export function SegmentedControlLinks({
  current,
  options,
  label,
}: {
  current: string;
  options: Array<{ value: string; label: string }>;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <SegmentedControl
      label={label}
      value={current}
      options={options}
      onChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === 'all') params.delete('own');
        else params.set('own', value);
        params.delete('page');
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }}
    />
  );
}
