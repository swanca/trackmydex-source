import { describe, expect, it } from 'vitest';
import { applyCondition, conditionMultiplier, CONDITION_MULTIPLIERS } from '@/lib/pricing/condition';
import {
  isLanguagePricedExactly,
  pickPrice,
  valueStack,
  type StoredPrice,
} from '@/lib/pricing/select';
import { addMoney, convert, formatMoney, toMinor } from '@/lib/pricing/money';
import { intlLocale } from '@/lib/intl-locale';

/**
 * Valuation is the part of this product that is most expensive to get wrong: a
 * subtle error here misprices an entire collection silently. These tests pin
 * the rules that keep an estimate honest.
 */

const RATES = { 'EUR:USD': 1.1, 'USD:EUR': 1 / 1.1 };
const NOW = new Date('2026-09-19T00:00:00Z');

function price(overrides: Partial<StoredPrice> = {}): StoredPrice {
  return {
    provider: 'tcgdex.cardmarket',
    currency: 'EUR',
    market: '10.00',
    confidence: 'exact',
    fetchedAt: NOW,
    ...overrides,
  };
}

describe('money', () => {
  it('converts decimal strings to integer minor units without float drift', () => {
    expect(toMinor('0.07')).toBe(7);
    expect(toMinor(19.99)).toBe(1999);
    // 0.1 + 0.2 in floats is 0.30000000000000004; in minor units it is exact.
    expect(addMoney({ minor: toMinor(0.1), currency: 'EUR' }, { minor: toMinor(0.2), currency: 'EUR' }).minor).toBe(30);
  });

  it('refuses to add mismatched currencies rather than producing a wrong total', () => {
    expect(() =>
      addMoney({ minor: 100, currency: 'EUR' }, { minor: 100, currency: 'USD' }),
    ).toThrow(/EUR/);
  });

  it('converts in both directions from a single stored rate', () => {
    expect(convert({ minor: 1000, currency: 'EUR' }, 'USD', RATES).minor).toBe(1100);
    expect(convert({ minor: 1100, currency: 'USD' }, 'EUR', RATES).minor).toBe(1000);
  });

  it('renders an absent value as a dash rather than zero', () => {
    expect(formatMoney(null, 'en')).toBe('—');
  });
});

describe('condition multipliers', () => {
  it('leaves the near-mint baseline untouched', () => {
    const result = applyCondition(10, 'near_mint');
    expect(result).toEqual({ amount: 10, adjusted: false });
  });

  it('marks every other condition as adjusted', () => {
    for (const condition of Object.keys(CONDITION_MULTIPLIERS) as Array<
      keyof typeof CONDITION_MULTIPLIERS
    >) {
      if (condition === 'near_mint') continue;
      expect(applyCondition(10, condition).adjusted).toBe(true);
    }
  });

  it('orders multipliers monotonically from mint to poor', () => {
    const order = ['mint', 'near_mint', 'excellent', 'good', 'light_played', 'played', 'poor'] as const;
    const values = order.map((condition) => conditionMultiplier(condition));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
  });
});

describe('pickPrice', () => {
  it('prefers an exact reading over a more-preferred provider that is approximate', () => {
    const picked = pickPrice(
      [
        price({ provider: 'tcgdex.cardmarket', confidence: 'approximate', approximationReason: 'variant-substitution:reverse->normal' }),
        price({ provider: 'tcgdex.tcgplayer', currency: 'USD', market: '12.00', confidence: 'exact' }),
      ],
      'USD',
      RATES,
    );
    expect(picked?.provider).toBe('tcgdex.tcgplayer');
    expect(picked?.confidence).toBe('exact');
  });

  it('prefers the display currency so no conversion caveat is needed', () => {
    const picked = pickPrice(
      [
        price({ provider: 'tcgdex.tcgplayer', currency: 'USD', market: '12.00' }),
        price({ provider: 'tcgdex.cardmarket', currency: 'EUR', market: '10.00' }),
      ],
      'EUR',
      RATES,
    );
    expect(picked?.amount).toEqual({ minor: 1000, currency: 'EUR' });
    expect(picked?.reasons).toHaveLength(0);
  });

  it('downgrades a converted price to approximate and says why', () => {
    const picked = pickPrice([price({ currency: 'EUR', market: '10.00' })], 'USD', RATES);
    expect(picked?.amount).toEqual({ minor: 1100, currency: 'USD' });
    expect(picked?.confidence).toBe('approximate');
    expect(picked?.reasons).toContain('currency-converted:EUR->USD');
  });

  it('returns null when no provider has a market figure', () => {
    expect(pickPrice([price({ market: null })], 'EUR', RATES)).toBeNull();
    expect(pickPrice([], 'EUR', RATES)).toBeNull();
  });

  it('keeps the original currency rather than inventing a number when no rate exists', () => {
    const picked = pickPrice([price({ currency: 'EUR', market: '10.00' })], 'USD', {});
    expect(picked?.amount).toEqual({ minor: 1000, currency: 'EUR' });
  });
});

describe('valueStack', () => {
  it('multiplies by quantity', () => {
    const result = valueStack(
      { prices: [price({ market: '10.00' })], quantity: 3, condition: 'near_mint', language: 'en' },
      'EUR',
      RATES,
    );
    expect(result.unit.minor).toBe(1000);
    expect(result.total.minor).toBe(3000);
    expect(result.confidence).toBe('exact');
  });

  it('applies the condition multiplier and flags the adjustment', () => {
    const result = valueStack(
      { prices: [price({ market: '10.00' })], quantity: 1, condition: 'played', language: 'en' },
      'EUR',
      RATES,
    );
    expect(result.unit.minor).toBe(400);
    expect(result.confidence).toBe('approximate');
    expect(result.reasons).toContain('condition-adjusted:played');
  });

  it('flags a Japanese copy claimed against a western set', () => {
    const result = valueStack(
      {
        prices: [price()],
        quantity: 1,
        condition: 'near_mint',
        language: 'ja',
        setOriginLanguage: 'en',
        setLanguages: ['en', 'fr'],
      },
      'EUR',
      RATES,
    );
    expect(result.confidence).toBe('approximate');
    expect(result.reasons).toContain('language-substitution:ja->en');
  });

  it('treats a Japanese copy of a Japanese set as exact', () => {
    // Japanese sets are separate releases with their own Cardmarket products,
    // so this is a real reading and not a substitution.
    const result = valueStack(
      {
        prices: [price()],
        quantity: 1,
        condition: 'near_mint',
        language: 'ja',
        setOriginLanguage: 'ja',
        setLanguages: ['ja'],
      },
      'EUR',
      RATES,
    );
    expect(result.confidence).toBe('exact');
    expect(result.reasons).toHaveLength(0);
  });

  it('treats a western language of a western set as exact', () => {
    const result = valueStack(
      {
        prices: [price()],
        quantity: 1,
        condition: 'near_mint',
        language: 'fr',
        setOriginLanguage: 'en',
        setLanguages: ['en', 'fr', 'de'],
      },
      'EUR',
      RATES,
    );
    expect(result.confidence).toBe('exact');
    expect(result.reasons).toHaveLength(0);
  });

  it('flags a western language the set was never printed in', () => {
    const result = valueStack(
      {
        prices: [price()],
        quantity: 1,
        condition: 'near_mint',
        language: 'it',
        setOriginLanguage: 'en',
        setLanguages: ['en', 'fr'],
      },
      'EUR',
      RATES,
    );
    expect(result.confidence).toBe('approximate');
  });

  it('never reports a value for an unpriced printing', () => {
    const result = valueStack(
      { prices: [], quantity: 5, condition: 'near_mint', language: 'en' },
      'EUR',
      RATES,
    );
    expect(result.total.minor).toBe(0);
    expect(result.provider).toBeNull();
  });

  it('treats a negative or fractional quantity as zero copies rather than negative value', () => {
    const result = valueStack(
      { prices: [price()], quantity: -3, condition: 'near_mint', language: 'en' },
      'EUR',
      RATES,
    );
    expect(result.total.minor).toBe(0);
  });
});

describe('isLanguagePricedExactly', () => {
  it('is exact for the set own language', () => {
    expect(isLanguagePricedExactly('ja', 'ja', ['ja'])).toBe(true);
    expect(isLanguagePricedExactly('ko', 'ko', ['ko'])).toBe(true);
    expect(isLanguagePricedExactly('en', 'en', ['en'])).toBe(true);
  });

  it('is exact across western languages of a western set', () => {
    expect(isLanguagePricedExactly('fr', 'en', ['en', 'fr'])).toBe(true);
    expect(isLanguagePricedExactly('de', 'en', ['en', 'de'])).toBe(true);
  });

  it('is approximate for an Asian language against a western set', () => {
    expect(isLanguagePricedExactly('ja', 'en', ['en', 'fr'])).toBe(false);
    expect(isLanguagePricedExactly('zh-tw', 'en', ['en'])).toBe(false);
  });

  it('is approximate for a western language against an Asian set', () => {
    expect(isLanguagePricedExactly('en', 'ja', ['ja'])).toBe(false);
  });

  it('is approximate for a language the set was not printed in', () => {
    expect(isLanguagePricedExactly('it', 'en', ['en', 'fr'])).toBe(false);
  });

  it('assumes printed when the set language list is unknown', () => {
    // A set ingested before the languages column was populated must not have
    // every western row downgraded to approximate.
    expect(isLanguagePricedExactly('fr', 'en', [])).toBe(true);
  });
});

/**
 * A bad locale must not take down a page.
 *
 * An empty tag reaching Intl threw RangeError inside the home page's rail,
 * which errored the route's Suspense boundary: the HTML still rendered, so
 * the page looked fine, but nothing inside it ever hydrated and every button
 * was dead. Formatting a price is not worth a page.
 */
describe('locale robustness', () => {
  const price = { minor: 12_345, currency: 'EUR' as const };

  it.each(['', ' ', 'not a locale', 'fr_FR', '@@@'])(
    'formats money with a broken locale (%j) instead of throwing',
    (locale) => {
      expect(() => formatMoney(price, locale)).not.toThrow();
      expect(formatMoney(price, locale)).toMatch(/123/);
    },
  );

  it('still honours a good locale', () => {
    // Non-breaking spaces vary by ICU build, so compare on the digits and mark.
    expect(formatMoney(price, 'fr-FR')).toMatch(/€/);
    expect(formatMoney(price, 'en-US')).toMatch(/^€|\$/);
  });

  it('accepts the tags the app actually routes on', () => {
    for (const locale of ['en', 'fr', 'es', 'pt', 'it', 'ja']) {
      expect(intlLocale(locale)).toBeTruthy();
    }
  });

  it('rejects what Intl would reject', () => {
    expect(intlLocale('')).toBeUndefined();
    expect(intlLocale('not a locale')).toBeUndefined();
    expect(intlLocale(null)).toBeUndefined();
  });
});
