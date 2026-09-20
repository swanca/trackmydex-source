import type { Currency } from '@/db/schema/enums';
import { intlLocale } from '@/lib/intl-locale';

/**
 * Money handling.
 *
 * All arithmetic is done in integer minor units (cents) and only converted back
 * to a decimal at the edge. Summing thousands of float euros to produce a
 * portfolio total accumulates visible error; integers do not.
 */

export interface Money {
  minor: number;
  currency: Currency;
}

export function toMinor(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

export function money(amount: number | string | null | undefined, currency: Currency): Money {
  return { minor: toMinor(amount), currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Refusing to add ${a.currency} to ${b.currency} without an explicit rate`);
  }
  return { minor: a.minor + b.minor, currency: a.currency };
}

/** Rates keyed `EUR:USD`. Populated from the `fx_rate` table or FX_EUR_USD. */
export type FxRates = Record<string, number>;

export function convert(value: Money, target: Currency, rates: FxRates): Money {
  if (value.currency === target) return value;
  const direct = rates[`${value.currency}:${target}`];
  if (direct) return { minor: Math.round(value.minor * direct), currency: target };
  const inverse = rates[`${target}:${value.currency}`];
  if (inverse && inverse !== 0) {
    return { minor: Math.round(value.minor / inverse), currency: target };
  }
  throw new Error(`No FX rate available for ${value.currency} -> ${target}`);
}

/** Convert when possible; otherwise return null so callers can exclude the row. */
export function tryConvert(value: Money, target: Currency, rates: FxRates): Money | null {
  try {
    return convert(value, target, rates);
  } catch {
    return null;
  }
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  value: Money | null | undefined,
  locale: string,
  options: { compact?: boolean; showDecimals?: boolean } = {},
): string {
  if (!value) return '—';
  const { compact = false, showDecimals = true } = options;
  const key = `${locale}:${value.currency}:${compact}:${showDecimals}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale(locale), {
      style: 'currency',
      currency: value.currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: showDecimals ? 2 : 0,
      minimumFractionDigits: showDecimals && !compact ? 2 : 0,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(toMajor(value.minor));
}

// Same reasoning as formatMoney above: building a NumberFormat costs far more
// than using one, and these are called once per row on list screens.
const plainFormatters = new Map<string, Intl.NumberFormat>();

function plainFormatter(key: string, build: () => Intl.NumberFormat): Intl.NumberFormat {
  let formatter = plainFormatters.get(key);
  if (!formatter) {
    formatter = build();
    plainFormatters.set(key, formatter);
  }
  return formatter;
}

export function formatPercent(value: number, locale: string, fractionDigits = 0): string {
  return plainFormatter(
    `pct:${locale}:${fractionDigits}`,
    () =>
      new Intl.NumberFormat(intlLocale(locale), {
        style: 'percent',
        maximumFractionDigits: fractionDigits,
      }),
  ).format(value);
}

export function formatNumber(value: number, locale: string): string {
  return plainFormatter(`num:${locale}`, () => new Intl.NumberFormat(intlLocale(locale))).format(value);
}
