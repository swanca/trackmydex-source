import { UI_LOCALES } from './catalog/languages';
import { intlLocale } from './intl-locale';

/**
 * Date formatting that cannot take a page down.
 *
 * `toLocaleDateString('')` throws `RangeError: Incorrect locale information
 * provided`, and `new Date(undefined).toLocaleDateString('en')` throws
 * `RangeError: Invalid time value`. Both are trivially reachable - an empty
 * route param, a null release date on a promo set - and both were, in practice,
 * rendering the whole set page as an error boundary instead of a missing date.
 *
 * A date is decoration on these screens. Failing to format one should degrade
 * to a dash, never to a 500.
 */

const FALLBACK_LOCALE = 'en';

/**
 * Formatter cache.
 *
 * `toLocaleDateString(locale, options)` builds a fresh Intl.DateTimeFormat on
 * every call, and constructing one is far more expensive than using it. The set
 * index renders 424 rows with a date each, which made this the single largest
 * cost in that page - more than the query it runs. There are only a handful of
 * distinct (locale, options) pairs in the whole app, so they are built once.
 */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${options.year ?? ''}|${options.month ?? ''}|${options.day ?? ''}|${options.hour ?? ''}|${options.minute ?? ''}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlLocale(locale), options);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormatter(locale: string): Intl.DateTimeFormat {
  let formatter = dateTimeFormatters.get(locale);
  if (!formatter) {
    // These options are exactly what `toLocaleString()` with no arguments
    // resolves to, so the rendered output is unchanged.
    formatter = new Intl.DateTimeFormat(intlLocale(locale), {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    dateTimeFormatters.set(locale, formatter);
  }
  return formatter;
}

/** `safeLocale` walks an allow-list and can call into Intl; cache its answer. */
const resolvedLocales = new Map<string, string>();

function safeLocale(locale: string | undefined | null): string {
  if (!locale) return FALLBACK_LOCALE;
  const trimmed = locale.trim();
  if (!trimmed) return FALLBACK_LOCALE;
  // Cheap allow-list first: these are the only locales we ship.
  if ((UI_LOCALES as readonly string[]).includes(trimmed)) return trimmed;

  const cached = resolvedLocales.get(trimmed);
  if (cached !== undefined) return cached;

  let resolved: string;
  try {
    resolved =
      Intl.DateTimeFormat.supportedLocalesOf([trimmed]).length > 0 ? trimmed : FALLBACK_LOCALE;
  } catch {
    resolved = FALLBACK_LOCALE;
  }
  resolvedLocales.set(trimmed, resolved);
  return resolved;
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: Date | string | number | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
  fallback = '—',
): string {
  const date = toDate(value);
  if (!date) return fallback;
  try {
    return dateFormatter(safeLocale(locale), options).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatMonthYear(
  value: Date | string | number | null | undefined,
  locale: string,
  fallback = '',
): string {
  return formatDate(value, locale, { year: 'numeric', month: 'short' }, fallback);
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale: string,
  fallback = '—',
): string {
  const date = toDate(value);
  if (!date) return fallback;
  try {
    return dateTimeFormatter(safeLocale(locale)).format(date);
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }
}
