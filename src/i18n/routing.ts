import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';
import { UI_LOCALES } from '@/lib/catalog/languages';

/**
 * UI locales.
 *
 * This is the language of the *interface*. It is unrelated to the printed
 * language of a card: a French-speaking user browses a French UI while
 * collecting Japanese prints, and both facts are stored separately.
 *
 * The list itself lives in `@/lib/catalog/languages` so that it can be imported
 * without pulling in the Next navigation runtime - which is what lets the
 * catalogue-parity test run in plain Node.
 *
 * Every locale here needs a full catalogue in `messages/<locale>.json`; there
 * is no partial-translation fallback, because a screen that is half-translated
 * is worse than one that is consistently in a second language.
 */
export const routing = defineRouting({
  locales: UI_LOCALES,
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
