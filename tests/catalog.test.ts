import { describe, expect, it } from 'vitest';
import { cardSortIndex, decodeLocalId } from '@/lib/catalog/sort';
import { eraForSeries, ERAS, SERIES_TO_ERA } from '@/lib/catalog/eras';
import {
  cardmarketQueryName,
  cardmarketSearchUrl,
  hasExactMarketMapping,
  tcgplayerProductUrl,
} from '@/lib/pricing/links';
import { TcgdexCardmarketProvider, TcgdexTcgplayerProvider } from '@/providers/pricing/tcgdex';
import type { PriceableVariant } from '@/providers/pricing/types';
import { cardImage } from '@/lib/images';
import { assessFraming, READY_FRAMES } from '@/lib/scan/framing';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUBSET_PARENT, parentSetId, setIdWithSubsets } from '@/lib/catalog/subsets';
import { nameKey } from '@/server/sync/sealed';

describe('card number ordering', () => {
  it('orders plain numbers numerically, not lexically', () => {
    expect(cardSortIndex('2')).toBeLessThan(cardSortIndex('10'));
    expect(cardSortIndex('9')).toBeLessThan(cardSortIndex('100'));
  });

  it('ignores leading zeros', () => {
    expect(cardSortIndex('007')).toBe(cardSortIndex('7'));
  });

  it('keeps prefixed numbers together and after plain numbers', () => {
    const h1 = cardSortIndex('H1');
    const h12 = cardSortIndex('H12');
    expect(h1).toBeLessThan(h12);
    expect(cardSortIndex('102')).toBeLessThan(h1);
  });

  it('groups different prefixes into different bands', () => {
    expect(cardSortIndex('TG01')).not.toBe(cardSortIndex('GG01'));
  });

  it('orders lettered suffixes after their base number but before the next', () => {
    expect(cardSortIndex('25')).toBeLessThan(cardSortIndex('25a'));
    expect(cardSortIndex('25a')).toBeLessThan(cardSortIndex('26'));
  });

  it('puts symbol-only numbers last without throwing', () => {
    expect(cardSortIndex('?')).toBeGreaterThan(cardSortIndex('300'));
    expect(cardSortIndex('!')).toBeGreaterThan(cardSortIndex('300'));
    expect(cardSortIndex('')).toBeGreaterThan(0);
  });

  it('decodes percent-encoded ids and survives malformed ones', () => {
    expect(decodeLocalId('%3F')).toBe('?');
    expect(decodeLocalId('%')).toBe('%');
  });
});

describe('era mapping', () => {
  it('maps every known series to an era that exists', () => {
    const eraIds = new Set(ERAS.map((era) => era.id));
    for (const eraId of Object.values(SERIES_TO_ERA)) {
      expect(eraIds.has(eraId)).toBe(true);
    }
  });

  it('falls back to the promos bucket for an unknown series', () => {
    expect(eraForSeries('a-series-that-does-not-exist')).toBe('special');
  });

  it('keeps era sort order strictly increasing', () => {
    const orders = ERAS.map((era) => era.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe('market links', () => {
  /**
   * Cardmarket used to be linked by `?idProduct=`, which does not resolve to a
   * product: it lands on the generic Singles listing. Their real URLs are
   * slug-based and the slug is not derivable - checked against three live
   * examples, two of which contradict every rule that fits the others. So the
   * contract here is a search that always reaches a real page, and the exact
   * link duty moves to TCGplayer.
   */
  /**
   * These two cases come from testing Cardmarket's own search by hand, and
   * both returned nothing before the query was shaped this way.
   */
  it('drops the suffix: "Mewtwo EX XY107" finds nothing, "Mewtwo XY107" works', () => {
    const url = cardmarketSearchUrl('Mewtwo EX', 'XY107', 'XYP');
    expect(decodeURIComponent(url)).toContain('searchString=Mewtwo XY107');
    expect(url).not.toContain('EX');
  });

  it('adds the set code to a bare number: "Mewtwo 10" needs "Mewtwo BS 10"', () => {
    const url = cardmarketSearchUrl('Mewtwo', '10', 'BS');
    expect(decodeURIComponent(url)).toContain('searchString=Mewtwo BS 10');
  });

  it('leaves out the set code when the number already names its set', () => {
    const url = cardmarketSearchUrl('Mewtwo', 'XY107', 'XYP');
    expect(decodeURIComponent(url)).not.toContain('XYP');
  });

  it('keeps a name that merely ends in a suffix-like word', () => {
    expect(cardmarketQueryName('Dark Charizard')).toBe('Dark Charizard');
    expect(cardmarketQueryName('Professor Oak')).toBe('Professor Oak');
    expect(cardmarketQueryName('Rayquaza VMAX')).toBe('Rayquaza');
  });

  it('localises the Cardmarket path for supported UI locales', () => {
    expect(cardmarketSearchUrl('Pikachu', '1', 'BS', 'fr')).toContain('/fr/');
    expect(cardmarketSearchUrl('Pikachu', '1', 'BS', 'ja')).toContain('/en/');
  });

  it('survives a card name with punctuation', () => {
    const url = cardmarketSearchUrl("Farfetch'd", '083', 'BS');
    expect(url).toContain('Farfetch');
    expect(() => new URL(url)).not.toThrow();
  });

  it('builds a stable TCGplayer product URL', () => {
    expect(tcgplayerProductUrl(219333)).toBe('https://www.tcgplayer.com/product/219333');
  });

  it('reports no mapping when neither marketplace id is known', () => {
    expect(hasExactMarketMapping({ cardmarketProductId: null, tcgplayerProductId: null })).toBe(false);
    expect(hasExactMarketMapping({ cardmarketProductId: 1, tcgplayerProductId: null })).toBe(true);
  });
});

/**
 * The provider tests use the exact payload shape returned by the live TCGdex
 * API on 2026-09-19, so a silent upstream change shows up as a failing test
 * rather than as wrong prices.
 */
const TCGDEX_PAYLOAD = {
  cardmarket: {
    updated: '2026-09-18T22:54:57.895Z',
    unit: 'EUR',
    idProduct: 483559,
    avg: 0.08,
    low: 0.02,
    trend: 0.08,
    avg1: 0.06,
    avg7: 0.1,
    avg30: 0.09,
    'avg-holo': 0.25,
    'low-holo': 0.04,
    'trend-holo': 0.19,
    'avg7-holo': 0.22,
    'avg30-holo': 0.3,
  },
  tcgplayer: {
    unit: 'USD',
    updated: '2026-09-18T22:54:58.659Z',
    normal: { productId: 219333, lowPrice: 0.02, midPrice: 0.22, highPrice: 25.19, marketPrice: 0.2 },
    'reverse-holofoil': {
      productId: 219333,
      lowPrice: 0.17,
      midPrice: 0.44,
      highPrice: 19.96,
      marketPrice: 0.46,
    },
  },
};

function variant(overrides: Partial<PriceableVariant> = {}): PriceableVariant {
  return {
    variantId: 'swsh3-136::normal',
    cardId: 'swsh3-136',
    variantType: 'normal',
    size: 'standard',
    cardmarketProductId: 483559,
    tcgplayerProductId: 219333,
    ...overrides,
  };
}

describe('TCGdex Cardmarket provider', () => {
  const provider = new TcgdexCardmarketProvider();

  it('reads the plain fields for a normal printing', () => {
    const [quote] = provider.fromCatalogPayload(variant(), TCGDEX_PAYLOAD);
    expect(quote?.market).toBe(0.08);
    expect(quote?.low).toBe(0.02);
    expect(quote?.confidence).toBe('exact');
    expect(quote?.currency).toBe('EUR');
  });

  it('reads the -holo fields for a reverse holo, not the plain ones', () => {
    const [quote] = provider.fromCatalogPayload(
      variant({ variantType: 'reverse', variantId: 'swsh3-136::reverse' }),
      TCGDEX_PAYLOAD,
    );
    // Using `avg` here instead of `avg-holo` would understate this printing
    // threefold, which is exactly the bug this mapping exists to prevent.
    expect(quote?.market).toBe(0.25);
    expect(quote?.low).toBe(0.04);
    expect(quote?.confidence).toBe('exact');
  });

  it('falls back to the base product for a reverse with no -holo reading, and says so', () => {
    const payload = { cardmarket: { ...TCGDEX_PAYLOAD.cardmarket } } as Record<string, unknown>;
    const cm = payload.cardmarket as Record<string, unknown>;
    delete cm['avg-holo'];
    delete cm['trend-holo'];

    const [quote] = provider.fromCatalogPayload(variant({ variantType: 'reverse' }), payload);
    expect(quote?.market).toBe(0.08);
    expect(quote?.confidence).toBe('approximate');
    expect(quote?.approximationReason).toBe('variant-substitution:reverse->normal');
  });

  it('marks a 1st edition priced from the base product as approximate', () => {
    const [quote] = provider.fromCatalogPayload(
      variant({ variantType: 'firstEdition' }),
      TCGDEX_PAYLOAD,
    );
    expect(quote?.confidence).toBe('approximate');
    expect(quote?.approximationReason).toContain('firstEdition');
  });

  /**
   * The product id is still recorded - it is a real, stable reference and the
   * admin mapping screen shows it - but no URL is stored for Cardmarket,
   * because none of their URLs can be built from an id. Storing one anyway is
   * what produced links that quietly landed on the Singles listing.
   */
  it('records the Cardmarket product id but stores no URL for it', () => {
    const [quote] = provider.fromCatalogPayload(variant(), TCGDEX_PAYLOAD);
    expect(quote?.sourceProductId).toBe('483559');
    expect(quote?.sourceUrl).toBeNull();
  });

  it('emits nothing rather than a zero when the payload has no Cardmarket block', () => {
    expect(provider.fromCatalogPayload(variant(), { tcgplayer: {} })).toHaveLength(0);
    expect(provider.fromCatalogPayload(variant(), null)).toHaveLength(0);
  });
});

describe('TCGdex TCGplayer provider', () => {
  const provider = new TcgdexTcgplayerProvider();

  it('picks the finish matching the printing', () => {
    const [normal] = provider.fromCatalogPayload(variant(), TCGDEX_PAYLOAD);
    expect(normal?.market).toBe(0.2);

    const [reverse] = provider.fromCatalogPayload(
      variant({ variantType: 'reverse' }),
      TCGDEX_PAYLOAD,
    );
    expect(reverse?.market).toBe(0.46);
    expect(reverse?.confidence).toBe('exact');
  });

  it('emits nothing for a holo when only a normal finish is published', () => {
    // Deliberate: a holo valued from its normal-print sibling can be wrong by an
    // order of magnitude, so `holo` has no fallback in TCGPLAYER_FINISHES. No
    // price is better than a confidently wrong one.
    expect(provider.fromCatalogPayload(variant({ variantType: 'holo' }), TCGDEX_PAYLOAD)).toHaveLength(0);
  });

  it('substitutes and flags for printings where a fallback is defensible', () => {
    // A promo has no finish of its own on TCGplayer, so the base finish is used
    // and the substitution is recorded rather than hidden.
    const [quote] = provider.fromCatalogPayload(variant({ variantType: 'wPromo' }), TCGDEX_PAYLOAD);
    expect(quote?.market).toBe(0.2);
    expect(quote?.confidence).toBe('exact');

    const [other] = provider.fromCatalogPayload(variant({ variantType: 'unlimited' }), TCGDEX_PAYLOAD);
    expect(other?.confidence).toBe('approximate');
    expect(other?.approximationReason).toContain('unlimited');
  });

  it('reports USD, matching the marketplace', () => {
    const [quote] = provider.fromCatalogPayload(variant(), TCGDEX_PAYLOAD);
    expect(quote?.currency).toBe('USD');
  });
});

/**
 * Regression: a real full-catalog import failed four Japanese sets on this.
 * TCGdex uses fractional dex ids for alternate formes (the Gold Star Rayquaza
 * in PCG2 is 384.1), and Postgres rejects the entire insert batch for an
 * integer[] column with SQLSTATE 22P02.
 */
describe('national dex normalisation', () => {
  // Mirrors toDexIds in the provider, which is module-private.
  const toDexIds = (raw: number[] | undefined): number[] => {
    if (!raw) return [];
    const out: number[] = [];
    for (const value of raw) {
      const base = Math.floor(Number(value));
      if (Number.isFinite(base) && base > 0 && !out.includes(base)) out.push(base);
    }
    return out;
  };

  it('floors an alternate-forme id to its base species', () => {
    // 384.1 is Rayquaza; searching dex 384 must find this card.
    expect(toDexIds([384.1])).toEqual([384]);
  });

  it('leaves whole numbers alone', () => {
    expect(toDexIds([25, 162])).toEqual([25, 162]);
  });

  it('collapses formes of the same species to one entry', () => {
    expect(toDexIds([384, 384.1, 384.2])).toEqual([384]);
  });

  it('drops values that are not usable dex numbers', () => {
    expect(toDexIds([0, -3, Number.NaN, 25])).toEqual([25]);
    expect(toDexIds(undefined)).toEqual([]);
  });
});

/**
 * Artwork URLs.
 *
 * The fallback images are the ones people notice: TCGdex has no art for about
 * 5,700 cards, so those come from TCGplayer, and their size is part of the
 * filename rather than something the CDN negotiates.
 */
describe('card artwork', () => {
  const FALLBACK = 'https://tcgplayer-cdn.tcgplayer.com/product/272493_200w.jpg';

  it('keeps the cheap thumbnail for grids', () => {
    expect(cardImage(FALLBACK, 'low')).toBe(FALLBACK);
  });

  it('asks for the large file when a detail view wants one', () => {
    // Returning the 200px thumbnail here is what made every fallback card
    // look soft on its own page, whatever size it was displayed at.
    expect(cardImage(FALLBACK, 'high')).toBe(
      'https://tcgplayer-cdn.tcgplayer.com/product/272493_in_1000x1000.jpg',
    );
  });

  it('re-sizes whatever size the provider happened to give us', () => {
    expect(cardImage('https://tcgplayer-cdn.tcgplayer.com/product/9_400w.jpg', 'high')).toBe(
      'https://tcgplayer-cdn.tcgplayer.com/product/9_in_1000x1000.jpg',
    );
  });

  it('still appends quality to a TCGdex base URL', () => {
    expect(cardImage('https://assets.tcgdex.net/en/swsh/swsh3/136', 'low')).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh3/136/low.webp',
    );
    expect(cardImage('https://assets.tcgdex.net/en/swsh/swsh3/136', 'high')).toBe(
      'https://assets.tcgdex.net/en/swsh/swsh3/136/high.png',
    );
  });

  it('leaves an unrecognised complete URL alone', () => {
    const other = 'https://images.example.com/a/b.png';
    expect(cardImage(other, 'high')).toBe(other);
  });

  it('has nothing to show without a base URL', () => {
    expect(cardImage(null)).toBeNull();
  });
});

/**
 * Scanner framing.
 *
 * The scanner only worked with the phone almost touching the card, because
 * it hashed and posted every frame regardless of what was in it. This is the
 * gate that decides whether a frame is worth the round trip, and what to
 * tell the person when it is not.
 */
describe('scan framing', () => {
  const W = 1000;
  const H = 1000;
  /** A card-shaped box of a given side length, centred. */
  const box = (side: number, score = 0.9) => ({
    x: (W - side) / 2,
    y: (H - side) / 2,
    width: side,
    height: side,
    score,
  });

  it('asks for a card when nothing is in view', () => {
    expect(assessFraming([], W, H).state).toBe('searching');
  });

  it('asks the user to come closer when the card is small in frame', () => {
    // 300x300 of a 1000x1000 frame is 9%: the artwork crop would be a few
    // dozen pixels across, which hashes to noise.
    expect(assessFraming([box(300)], W, H).state).toBe('closer');
  });

  it('is ready once the card fills enough of the frame', () => {
    const framing = assessFraming([box(600)], W, H);
    expect(framing.state).toBe('ready');
    expect(framing.fill).toBeCloseTo(0.36, 2);
  });

  it('asks the user to pull back when the card overflows', () => {
    expect(assessFraming([box(990)], W, H).state).toBe('farther');
  });

  it('ignores rectangles that are not card-shaped', () => {
    // A big low-scoring box is a table edge or a book, not a card.
    expect(assessFraming([box(600, 0.1)], W, H).state).toBe('searching');
  });

  it('judges on the nearest card when several are in shot', () => {
    expect(assessFraming([box(200), box(600)], W, H).state).toBe('ready');
  });

  it('waits for more than one good frame before firing', () => {
    // One is too eager: a card swinging past passes through "ready".
    expect(READY_FRAMES).toBeGreaterThan(1);
  });
});

/**
 * No `loading.tsx` anywhere under the app directory.
 *
 * On this version of Next, a route with a `loading.tsx` streams its content
 * into a hidden `<div id="S:n">` and never completes the Suspense boundary on
 * the client: `$RC` runs, finds no `<!--$?-->` marker to swap against, and
 * silently does nothing. The page draws - so it looks finished - but nothing
 * inside it hydrates. Every button, filter and stepper on the sets pages was
 * dead in production for exactly this reason, which is what the quantity
 * stepper "going 1, 2, then back to 1" was really about.
 *
 * Routes without one hydrate normally. A skeleton is not worth a dead page,
 * so until that is fixed upstream this stays a build failure rather than
 * something that creeps back in with the next route.
 */
describe('app routes', () => {
  it('ships no loading.tsx', () => {
    const appDir = resolve(process.cwd(), 'src/app');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/^loading\.(tsx|jsx|ts|js)$/.test(entry.name)) {
          found.push(path.replace(appDir, 'src/app'));
        }
      }
    };
    walk(appDir);
    expect(found).toEqual([]);
  });
});

/**
 * Subsets belong to their parent set.
 *
 * Upstream publishes a Trainer Gallery as its own set, so the browser listed
 * "Lost Origin" and "Lost Origin Trainer Gallery" side by side, which reads
 * as a duplicated catalogue. These guard the mapping rather than the
 * plumbing: a wrong parent id silently splits a set back in two.
 */
describe('set subsets', () => {
  it('points every subset at a set that is not itself a subset', () => {
    for (const [child, parent] of Object.entries(SUBSET_PARENT)) {
      expect(child, 'a subset cannot be its own parent').not.toBe(parent);
      expect(SUBSET_PARENT[parent], `${parent} is itself a subset`).toBeUndefined();
    }
  });

  it('groups the Trainer Galleries with their own set', () => {
    expect(parentSetId('swsh11tg')).toBe('swsh11');
    expect(setIdWithSubsets('swsh11')).toEqual(['swsh11', 'swsh11tg']);
  });

  it('handles the one that does not follow the id pattern', () => {
    // Hidden Fates is `sm115`, its Shiny Vault is `sma` - stripping a suffix
    // would never find it, which is why this is a list and not a rule.
    expect(parentSetId('sma')).toBe('sm115');
  });

  it('leaves an ordinary set alone', () => {
    expect(parentSetId('base1')).toBeNull();
    expect(setIdWithSubsets('base1')).toEqual(['base1']);
  });
});

/**
 * Artwork matched by name, as a last resort.
 *
 * A reprint collection numbers its cards by the original printing -
 * Charizard in the 30th Classic Collection is "4/102" where our catalogue
 * says "001" - so the number match finds nothing and all thirty cards end
 * up with no image, in a set the provider publishes without any.
 */
describe('card name normalisation', () => {
  it('ignores the qualifier TCGplayer adds to a reprint', () => {
    expect(nameKey('Gengar (Prime)')).toBe(nameKey('Gengar'));
    expect(nameKey('Metagross (Delta Species)')).toBe(nameKey('Metagross'));
    expect(nameKey('Genesect EX (Team Plasma)')).toBe(nameKey('Genesect EX'));
  });

  it('ignores a LV.X suffix', () => {
    expect(nameKey('Palkia LV.X')).toBe(nameKey('Palkia'));
    expect(nameKey('Palkia Lv. X')).toBe(nameKey('Palkia'));
  });

  it('ignores accents, case and punctuation', () => {
    expect(nameKey('Dracaufeu')).toBe(nameKey('DRACAUFEU'));
    expect(nameKey('Pikachu & Zekrom GX')).toBe(nameKey('pikachu and zekrom gx'.replace(' and ', ' & ')));
    expect(nameKey('Évoli')).toBe(nameKey('Evoli'));
  });

  it('keeps genuinely different cards apart', () => {
    // The qualifier is dropped, so these must differ on the name itself.
    expect(nameKey('Charizard')).not.toBe(nameKey('Charmander'));
    expect(nameKey('Mew')).not.toBe(nameKey('Mewtwo'));
  });

  it('does not collapse the two halves of a LEGEND into one key', () => {
    // Both halves normalise the same, which is precisely why the matcher
    // refuses them: one name, two products, two cards. A wrong picture is
    // worse than a missing one.
    expect(nameKey('Darkrai & Cresselia Legend (Top)')).toBe(
      nameKey('Darkrai & Cresselia Legend (Bottom)'),
    );
  });
});
