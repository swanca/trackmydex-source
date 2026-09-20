import type { CardLanguage } from '@/db/schema/enums';
import type { SealedKind } from '@/db/schema/enums';
import { logger } from '@/lib/logger';

/**
 * Sealed product catalogue and pricing, via TCGCSV.
 *
 * TCGCSV is a public mirror of TCGplayer's own catalogue API, refreshed daily
 * around 20:00 UTC. It is the only source found that covers sealed products
 * across the whole history of the game: Base Set theme decks from 1999 through
 * to boxes that have not shipped yet, Japanese releases included.
 *
 * Two deliberate limits, both surfaced in the UI rather than hidden:
 *
 *  - Prices are TCGplayer's, so they are USD. EUR is converted through the
 *    fx_rate table, and a converted figure is labelled as one.
 *  - TCGCSV publishes no SKU-level data, so there is no per-condition price for
 *    sealed products. This is not much of a loss: the market prices a sealed box
 *    as one thing.
 */

const BASE = 'https://tcgcsv.com/tcgplayer';

/** TCGplayer keeps Japanese releases in a separate category from western ones. */
export const CATEGORIES = [
  { id: 3, language: 'en' as CardLanguage, label: 'Pokemon' },
  { id: 85, language: 'ja' as CardLanguage, label: 'Pokemon Japan' },
] as const;

export interface TcgcsvGroup {
  groupId: number;
  name: string;
  abbreviation: string | null;
  publishedOn: string | null;
}

export interface TcgcsvProduct {
  productId: number;
  name: string;
  cleanName: string | null;
  imageUrl: string | null;
  url: string | null;
  groupId: number;
  presaleInfo?: { releasedOn?: string | null } | null;
  extendedData?: { name: string; value: string }[] | null;
}

export interface TcgcsvPrice {
  productId: number;
  subTypeName: string | null;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  directLowPrice: number | null;
}

async function getJson<T>(path: string): Promise<T[]> {
  const response = await fetch(`${BASE}/${path}`, {
    // TCGCSV answers 401 to a request with no User-Agent.
    headers: { 'user-agent': 'TrackMyDex/1.0 (+self-hosted collection tracker)' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`TCGCSV ${path} responded ${response.status}`);
  }
  const body = (await response.json()) as { success?: boolean; results?: T[] };
  return body.results ?? [];
}

export function listGroups(categoryId: number): Promise<TcgcsvGroup[]> {
  return getJson<TcgcsvGroup>(`${categoryId}/groups`);
}

export function listProducts(categoryId: number, groupId: number): Promise<TcgcsvProduct[]> {
  return getJson<TcgcsvProduct>(`${categoryId}/${groupId}/products`);
}

export function listPrices(categoryId: number, groupId: number): Promise<TcgcsvPrice[]> {
  return getJson<TcgcsvPrice>(`${categoryId}/${groupId}/prices`);
}

/**
 * Is this product a sealed product rather than a single card?
 *
 * TCGplayer has no type flag. What it does have is `extendedData`, where a
 * single always carries its collector number under `Number`. Sealed products
 * never do. Rarity is not a usable test - some sealed products carry one - and
 * matching on the name is worse still, since plenty of cards are named after
 * boxes ("Prism Star", "Tag Team"). The absence of a card number is the only
 * signal that holds across 27 years of catalogue.
 */
export function isSealed(product: TcgcsvProduct): boolean {
  const fields = new Set((product.extendedData ?? []).map((entry) => entry.name));
  return !fields.has('Number');
}

/**
 * Sort a product name into a shape.
 *
 * Order matters. "Booster Box Case" must be tested before "Booster Box", and
 * "Elite Trainer Box" before the generic box patterns, otherwise the broader
 * rule swallows the narrower one.
 */
const KIND_RULES: [RegExp, SealedKind][] = [
  [/\bcase\b/i, 'booster_case'],
  [/\belite trainer box\b|\betb\b/i, 'elite_trainer_box'],
  [/\bbuild\s*&?\s*battle\b/i, 'build_and_battle'],
  [/\bbooster bundle\b|\bbundle\b/i, 'bundle'],
  [/\bblister\b/i, 'blister'],
  [/\bbooster box\b|\bhalf booster box\b/i, 'booster_box'],
  [/\bbooster pack\b|\bsleeved booster\b|\bpack\b/i, 'booster_pack'],
  [/\btin\b/i, 'tin'],
  [/\b(theme )?deck\b|\bstarter set\b|\bdeck box\b/i, 'deck'],
  [/\b(premium )?collection\b|\bcollection box\b/i, 'collection'],
  [/\bbox set\b|\bgift set\b|\bcoffret\b|\bbox\b/i, 'box_set'],
];

export function classifyKind(name: string): SealedKind {
  for (const [pattern, kind] of KIND_RULES) {
    if (pattern.test(name)) return kind;
  }
  return 'other';
}

/**
 * Normalised form used to match a TCGplayer group against a set in our own
 * catalogue: casing, punctuation and `&` folded away.
 */
export function normaliseSetName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The names a TCGplayer group might be known by in our catalogue.
 *
 * The two vocabularies disagree in three consistent ways, all visible in the
 * live data:
 *
 *   "SWSH12: Silver Tempest"  vs  "Silver Tempest"     -- code prefix
 *   "XY - Evolutions"         vs  "Evolutions"         -- series prefix
 *   "EX Hidden Legends"       vs  "Hidden Legends"     -- era prefix
 *
 * Each stripped form is returned as an additional candidate rather than
 * replacing the original, because some sets really are named with the prefix
 * and dropping it unconditionally would break those.
 */
export function setNameCandidates(groupName: string): string[] {
  const out = new Set<string>();
  const add = (value: string) => {
    const key = normaliseSetName(value);
    if (key.length >= 3) out.add(key);
  };

  add(groupName);
  add(groupName.replace(/^[a-z0-9]{1,8}:\s*/i, ''));
  add(groupName.replace(/^(xy|sm|bw|hs|dp|swsh|sv|me)\s*[-–]\s*/i, ''));
  add(groupName.replace(/^ex\s+/i, ''));

  return [...out];
}

/**
 * TCGplayer's printing names, mapped onto our variant vocabulary.
 *
 * Unrecognised subtypes are dropped rather than guessed: a price filed under
 * the wrong printing is worse than no price, because it silently inflates or
 * deflates a collection total with no way for anyone to notice.
 */
const SUBTYPE_TO_VARIANT: Record<string, string> = {
  Normal: 'normal',
  Holofoil: 'holo',
  'Reverse Holofoil': 'reverse',
  '1st Edition Normal': 'firstEdition',
  '1st Edition Holofoil': 'firstEditionHolo',
  Unlimited: 'unlimited',
  'Unlimited Holofoil': 'unlimited',
};

export function variantForSubtype(subType: string | null | undefined): string | null {
  if (!subType) return null;
  return SUBTYPE_TO_VARIANT[subType] ?? null;
}

/**
 * The collector number as printed, from TCGplayer's `021/128` form.
 *
 * Leading zeros are kept: our catalogue stores `001`, not `1`, and a promo
 * number can be alphanumeric.
 */
export function collectorNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const head = raw.split('/')[0]?.trim();
  return head && head.length > 0 ? head : null;
}

export interface SingleCardPrice {
  /** Collector number as printed, e.g. `021`. */
  localId: string;
  /**
   * The product name, for sets where the number cannot match.
   *
   * A reprint collection carries the *original* card's number - Charizard
   * in the 30th Classic Collection is "4/102" - while our catalogue numbers
   * it 001-030. Nothing lines up, so the artwork has to be matched some
   * other way, and the name is the only thing both sides agree on.
   */
  name: string;
  /** TCGplayer's own thumbnail, used where the catalogue provider has none. */
  imageUrl: string | null;
  /** Our variant type, already mapped from TCGplayer's subtype. */
  variantType: string;
  sourceProductId: number;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  directLow: number | null;
}

export interface SealedFetchResult {
  products: {
    sourceProductId: number;
    sourceGroupId: number;
    sourceGroupName: string;
    name: string;
    kind: SealedKind;
    language: CardLanguage;
    imageUrl: string | null;
    productUrl: string | null;
    releasedOn: string | null;
  }[];
  prices: {
    sourceProductId: number;
    market: number | null;
    low: number | null;
    mid: number | null;
    high: number | null;
    directLow: number | null;
  }[];
  /**
   * Prices for the single cards in this group.
   *
   * These arrive in the same two files as the sealed products, so collecting
   * them costs no extra requests. They matter because TCGdex leaves a new set
   * unpriced for days after release - the 30th anniversary set had 158 cards
   * and not one price - while TCGplayer has every card from day one.
   */
  singles: SingleCardPrice[];
}

/**
 * Everything sealed in one group, with its prices.
 *
 * A group is the unit of work because that is how TCGCSV partitions its files:
 * one request for products, one for prices, and nothing smaller is addressable.
 */
export async function fetchGroup(
  categoryId: number,
  language: CardLanguage,
  group: TcgcsvGroup,
): Promise<SealedFetchResult> {
  const [products, prices] = await Promise.all([
    listProducts(categoryId, group.groupId),
    listPrices(categoryId, group.groupId).catch((cause) => {
      // A group with no sales yet has no price file. That is not a failure: the
      // products still belong in the catalogue, priced as unknown.
      logger.info('sealed.prices_missing', { groupId: group.groupId, cause: String(cause) });
      return [] as TcgcsvPrice[];
    }),
  ]);

  const sealed = products.filter(isSealed);
  const wanted = new Set(sealed.map((p) => p.productId));

  const singleByProduct = new Map<number, { localId: string; name: string; imageUrl: string | null }>();
  for (const product of products) {
    if (isSealed(product)) continue;
    const number = collectorNumber(
      product.extendedData?.find((entry) => entry.name === 'Number')?.value,
    );
    if (number) {
      singleByProduct.set(product.productId, {
        localId: number,
        name: product.name,
        imageUrl: product.imageUrl,
      });
    }
  }

  const singles: SingleCardPrice[] = [];
  for (const row of prices) {
    const single = singleByProduct.get(row.productId);
    if (!single) continue;
    const variantType = variantForSubtype(row.subTypeName);
    if (!variantType) continue;
    if (row.marketPrice == null && row.lowPrice == null) continue;
    singles.push({
      localId: single.localId,
      name: single.name,
      imageUrl: single.imageUrl,
      variantType,
      sourceProductId: row.productId,
      market: row.marketPrice,
      low: row.lowPrice,
      mid: row.midPrice,
      high: row.highPrice,
      directLow: row.directLowPrice,
    });
  }

  return {
    products: sealed.map((p) => ({
      sourceProductId: p.productId,
      sourceGroupId: group.groupId,
      sourceGroupName: group.name,
      name: p.name,
      kind: classifyKind(p.name),
      language,
      imageUrl: p.imageUrl,
      productUrl: p.url,
      releasedOn: p.presaleInfo?.releasedOn ? p.presaleInfo.releasedOn.slice(0, 10) : null,
    })),
    prices: prices
      .filter((row) => wanted.has(row.productId))
      // Sealed products report a single "Normal" subtype. Anything else on a
      // sealed row is noise from a mis-typed product; taking the first keeps one
      // price per product, which is what the unique index expects.
      .filter((row, index, all) => all.findIndex((r) => r.productId === row.productId) === index)
      .map((row) => ({
        sourceProductId: row.productId,
        market: row.marketPrice,
        low: row.lowPrice,
        mid: row.midPrice,
        high: row.highPrice,
        directLow: row.directLowPrice,
      })),
    singles,
  };
}
