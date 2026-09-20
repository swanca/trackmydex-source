'use client';

import { useTransition } from 'react';
import { useParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
import { UI_LOCALE_NAMES, UI_LOCALES, type UiLocale } from '@/lib/catalog/languages';
import { cn } from '@/lib/cn';

/**
 * Interface language.
 *
 * Available to everyone, signed in or not - previously it was buried in the
 * profile page, which meant a visitor could not read the app in their own
 * language until they had made an account in a language they could not read.
 *
 * It swaps the locale segment of the current URL and keeps the rest, so
 * changing language on a card page leaves you on that same card.
 *
 * This changes the *interface* only. The printed language of the cards you
 * collect is a separate setting, and the copy under the profile control says so.
 */
export function LanguageSwitcher({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [pending, startTransition] = useTransition();

  const current = (params?.locale as UiLocale) ?? 'en';

  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={current}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as UiLocale;
          startTransition(() => {
            // `pathname` from next-intl is already locale-stripped, so this
            // preserves the current page rather than dumping you on the home
            // screen - which is what a naive `router.push('/' + locale)` does.
            router.replace(pathname, { locale: next });
          });
        }}
        className={cn(
          'h-9 cursor-pointer appearance-none rounded-[var(--radius-pill)] border border-hairline',
          'bg-[rgb(148_163_208/0.06)] pr-7 pl-3 text-[0.8125rem] font-medium text-muted',
          'transition-colors hover:text-paper focus:outline-none',
          'focus-visible:outline-2 focus-visible:outline-azure focus-visible:outline-offset-2',
          pending && 'opacity-60',
        )}
      >
        {UI_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {UI_LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 20 20"
        aria-hidden
        className="pointer-events-none absolute right-2.5 size-3.5 text-faint"
      >
        <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </label>
  );
}
