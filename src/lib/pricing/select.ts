import type { CardLanguage, Condition, Currency, PriceConfidence } from '@/db/schema/enums';
import { PROVIDER_PREFERENCE } from '@/providers/pricing';
import { APPROX } from '@/providers/pricing/types';
import { applyCondition, roundMoney } from './condition';
import { convert, money, toMinor, type FxRates, type Money } from './money';

/**
 * Valuation rules.
 *
 * This module decides which number a user sees and how honest we are about it.
 * It is pure so it can be tested exhaustively, because a subtle mistake here
 * silently misprices an entire collection.
 */

export interface StoredPrice {
  provider: string;
  currency: Currency;
  market: string | number | null;
  low?: string | number | null;
  mid?: string | number | null;
  high?: string | number | null;
  trend?: string | number | null;
  avg1?: string | number | null;
  avg7?: string | number | null;
  avg30?: string | number | null;
  confidence: PriceConfidence;
  approximationReason?: string | null;
  sourceProductId?: string | null;
  sourceUrl?: string | null;
  fetchedAt: Date | string;
}

export interface ResolvedPrice {
  amount: Money;
  provider: string;
  marketplace: string;
  confidence: PriceConfidence;
  reasons: string[];
  fetchedAt: Date;
  sourceUrl: string | null;
}

const MARKETPLACE_BY_PROVIDER: Record<string, string> = {
  'tcgdex.cardmarket': 'Cardmarket',
  'tcgdex.tcgplayer': 'TCGplayer',
  'tcgcsv.tcgplayer': 'TCGplayer',
  pokemontcgio: 'TCGplayer',
};

/**
 * Pick the price to display for one printing.
 *
 * Preference order:
 *  1. a price already in the user's display currency (no conversion caveat);
 *  2. otherwise the highest-ranked configured provider, converted.
 *
 * An exact price always beats an approximate one from a more preferred provider:
 * a correct number from the second-choice marketplace is worth more to the user
 * than a substituted one from the first.
 */
export function pickPrice(
  prices: readonly StoredPrice[],
  displayCurrency: Currency,
  rates: FxRates,
): ResolvedPrice | null {
  const usable = prices.filter((p) => p.market !== null && p.market !== undefined);
  if (usable.length === 0) return null;

  const score = (p: StoredPrice) => {
    const providerRank = PROVIDER_PREFERENCE.indexOf(p.provider);
    return (
      (p.confidence === 'exact' ? 0 : 100) +
      (p.currency === displayCurrency ? 0 : 10) +
      (providerRank === -1 ? PROVIDER_PREFERENCE.length : providerRank)
    );
  };

  const best = [...usable].sort((a, b) => score(a) - score(b))[0];
  if (!best) return null;

  const raw = money(best.market, best.currency);
  const reasons: string[] = [];
  if (best.confidence === 'approximate' && best.approximationReason) {
    reasons.push(best.approximationReason);
  }

  let amount: Money;
  if (best.currency === displayCurrency) {
    amount = raw;
  } else {
    try {
      amount = convert(raw, displayCurrency, rates);
      reasons.push(APPROX.currencyConverted(best.currency, displayCurrency));
    } catch {
      // No rate: show the original currency rather than a wrong number.
      amount = raw;
    }
  }

  return {
    amount,
    provider: best.provider,
    marketplace: MARKETPLACE_BY_PROVIDER[best.provider] ?? best.provider,
    confidence: reasons.length > 0 ? 'approximate' : best.confidence,
    reasons,
    fetchedAt: best.fetchedAt instanceof Date ? best.fetchedAt : new Date(best.fetchedAt),
    sourceUrl: best.sourceUrl ?? null,
  };
}

export interface ValuationInput {
  prices: readonly StoredPrice[];
  quantity: number;
  condition: Condition;
  /** Printed language of the copies actually owned. */
  language: CardLanguage;
  /**
   * The language the set this card belongs to is canonically from.
   *
   * Japanese, Korean and Chinese sets are separate releases with their own
   * Cardmarket products, so a Japanese card in a Japanese set is priced
   * exactly. The same card claimed against a western set is not.
   */
  setOriginLanguage?: CardLanguage;
  /** Languages the set was actually printed in. */
  setLanguages?: readonly CardLanguage[];
}

export interface Valuation {
  /** Value of the whole stack. */
  total: Money;
  /** Value of a single copy. */
  unit: Money;
  confidence: PriceConfidence;
  reasons: string[];
  provider: string | null;
  marketplace: string | null;
  fetchedAt: Date | null;
}

/**
 * Western prints share one marketplace product.
 *
 * Cardmarket lists a western set's card as a single product with per-language
 * seller filters, so the published aggregate covers English, French, German,
 * Spanish, Italian and Portuguese copies of that set together. Treating any of
 * them as exact against a western set is therefore honest.
 *
 * Japanese, Korean and Chinese releases are *different sets* with their own
 * products and their own prices - verified against the live API, where the
 * Japanese set `SV1a` carries Cardmarket product ids distinct from every
 * western set. They are exact against their own set, and a substitution
 * anywhere else.
 */
const WESTERN_PRINT_LANGUAGES = new Set<CardLanguage>([
  'en',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'pt-br',
]);

/**
 * Is a price for this set a genuine reading for a copy in this language?
 *
 * Exported and pure so the rule can be tested directly - it decides whether a
 * number is presented as a market price or as an estimate, which is the
 * product's central honesty requirement.
 */
export function isLanguagePricedExactly(
  language: CardLanguage,
  setOriginLanguage: CardLanguage,
  setLanguages: readonly CardLanguage[] = [],
): boolean {
  if (language === setOriginLanguage) return true;

  // A western language copy of a western set that was printed in it.
  if (
    WESTERN_PRINT_LANGUAGES.has(language) &&
    WESTERN_PRINT_LANGUAGES.has(setOriginLanguage) &&
    (setLanguages.length === 0 || setLanguages.includes(language))
  ) {
    return true;
  }

  return false;
}

export function valueStack(
  input: ValuationInput,
  displayCurrency: Currency,
  rates: FxRates,
): Valuation {
  const empty: Valuation = {
    total: { minor: 0, currency: displayCurrency },
    unit: { minor: 0, currency: displayCurrency },
    confidence: 'approximate',
    reasons: [],
    provider: null,
    marketplace: null,
    fetchedAt: null,
  };

  const picked = pickPrice(input.prices, displayCurrency, rates);
  if (!picked) return empty;

  const reasons = [...picked.reasons];
  let confidence: PriceConfidence = picked.confidence;

  // Condition adjustment.
  const conditionResult = applyCondition(picked.amount.minor / 100, input.condition);
  if (conditionResult.adjusted) {
    reasons.push(APPROX.conditionAdjusted(input.condition));
    confidence = 'approximate';
  }

  // Language substitution.
  const origin = input.setOriginLanguage ?? 'en';
  if (!isLanguagePricedExactly(input.language, origin, input.setLanguages)) {
    reasons.push(APPROX.languageSubstitution(input.language, origin));
    confidence = 'approximate';
  }

  const unitMinor = toMinor(roundMoney(conditionResult.amount));
  const quantity = Math.max(0, Math.trunc(input.quantity));

  return {
    unit: { minor: unitMinor, currency: displayCurrency },
    total: { minor: unitMinor * quantity, currency: displayCurrency },
    confidence,
    reasons,
    provider: picked.provider,
    marketplace: picked.marketplace,
    fetchedAt: picked.fetchedAt,
  };
}

/** Human-readable key for a reason code; the UI translates these. */
export function reasonKey(reason: string): string {
  return reason.split(':')[0] ?? 'unknown';
}
