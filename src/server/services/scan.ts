import { sql } from 'drizzle-orm';
import { db, type SqlRow } from '@/db';
import type { CardLanguage, Currency } from '@/db/schema/enums';
import { hammingDistance, MATCH, parseFingerprint } from '@/lib/scan/phash';
import { logger } from '@/lib/logger';
import type { Money } from '@/lib/pricing/money';

/**
 * Photo recognition.
 *
 * Matching is a linear scan over every fingerprint held in memory. That sounds
 * wrong at 36,000 cards and is not: a 128-bit XOR plus popcount is a handful of
 * nanoseconds, so a full pass is well under a millisecond - far cheaper than
 * the BK-tree or LSH index it would take to beat it, and with no accuracy loss
 * from approximate search.
 *
 * The index is loaded once per process and refreshed on a timer, because the
 * catalogue only changes when a sync runs.
 */

interface IndexEntry {
  cardId: string;
  hash: bigint;
}

let index: IndexEntry[] = [];
let indexLoadedAt = 0;
let loading: Promise<void> | null = null;

const INDEX_TTL_MS = 10 * 60 * 1000;

async function loadIndex(): Promise<void> {
  const rows = await db.execute<SqlRow<{ id: string; image_phash: string }>>(sql`
    select id, image_phash from card where image_phash is not null
  `);

  index = rows.rows.map((row) => ({
    cardId: row.id,
    hash: parseFingerprint(row.image_phash),
  }));
  indexLoadedAt = Date.now();
  logger.info('scan.index_loaded', { fingerprints: index.length });
}

async function ensureIndex(): Promise<void> {
  if (index.length > 0 && Date.now() - indexLoadedAt < INDEX_TTL_MS) return;
  // Collapse concurrent first-hits onto one load rather than 8 parallel scans.
  loading ??= loadIndex().finally(() => {
    loading = null;
  });
  await loading;
}

export interface ScanCandidate {
  cardId: string;
  name: string;
  localId: string;
  setId: string;
  setName: string;
  /**
   * The language this printing is actually in.
   *
   * Artwork is shared across languages, so the shortlist routinely contains
   * the same card from a western set and its Japanese counterpart. Taking the
   * set's own language is how a Japanese card gets added as Japanese instead
   * of silently filed as English.
   */
  setLanguage: string;
  /** Set abbreviation, for the Cardmarket search. */
  setCode: string | null;
  imageBaseUrl: string | null;
  rarity: string | null;
  distance: number;
  defaultVariantId: string | null;
  price: Money | null;
}

export interface ScanResult {
  /** Ranked shortlist, closest first. Empty when nothing was near enough. */
  candidates: ScanCandidate[];
  /**
   * True only when the best match is both close *and* clearly ahead of the
   * runner-up. The UI may pre-select a confident match; it must still never add
   * a card without the user confirming.
   */
  confident: boolean;
  /** Gap between the best and second-best match, in bits. */
  margin: number;
  indexSize: number;
}

/**
 * Finds the cards whose artwork most resembles a supplied fingerprint.
 *
 * Deliberately returns a shortlist rather than an answer. Published benchmarks
 * for this technique put rank-1 accuracy around 70%, and artwork alone cannot
 * distinguish printed languages or reprints at all, so presenting one result as
 * "the card" would be wrong roughly a third of the time.
 */
export async function matchFingerprint(
  hex: string,
  options: { cardLanguage: CardLanguage; displayCurrency: Currency; limit?: number },
): Promise<ScanResult> {
  await ensureIndex();

  const probe = parseFingerprint(hex);
  const limit = options.limit ?? MATCH.SHORTLIST;

  // Single pass, keeping only what beats the threshold.
  const scored: Array<{ cardId: string; distance: number }> = [];
  for (const entry of index) {
    const distance = hammingDistance(probe, entry.hash);
    if (distance <= MATCH.MAX_DISTANCE) scored.push({ cardId: entry.cardId, distance });
  }
  scored.sort((a, b) => a.distance - b.distance);

  const top = scored.slice(0, limit);
  if (top.length === 0) {
    return { candidates: [], confident: false, margin: 0, indexSize: index.length };
  }

  const best = top[0]!;
  const runnerUp = top[1];
  const margin = runnerUp ? runnerUp.distance - best.distance : MATCH.MAX_DISTANCE;
  const confident = best.distance <= MATCH.CONFIDENT_DISTANCE && margin >= MATCH.MIN_MARGIN;

  const ids = top.map((row) => row.cardId);
  const detail = await db.execute<SqlRow<Omit<ScanCandidate, 'distance' | 'price'> & {
    priceMarket: string | null;
    priceCurrency: Currency | null;
    setLanguage: string;
    setCode: string | null;
  }>>(sql`
    select
      c.id as "cardId",
      coalesce(ct.name, c.name) as "name",
      coalesce(ct.local_id, c.local_id) as "localId",
      c.set_id as "setId",
      coalesce(st.name, s.name) as "setName",
      s.origin_language as "setLanguage",
      s.code as "setCode",
      coalesce(ct.image_base_url, c.image_base_url, c.fallback_image_url) as "imageBaseUrl",
      c.rarity,
      dv.id as "defaultVariantId",
      pr.market::text as "priceMarket",
      pr.currency as "priceCurrency"
    from card c
    join set s on s.id = c.set_id
    left join set_translation st on st.set_id = s.id and st.language = ${options.cardLanguage}
    left join card_translation ct on ct.card_id = c.id and ct.language = ${options.cardLanguage}
    left join lateral (
      select v.id from card_variant v where v.card_id = c.id
      order by v.is_default desc, v.variant_type limit 1
    ) dv on true
    left join lateral (
      select p.market, p.currency from card_price p
      where p.card_variant_id = dv.id and p.market is not null
      order by (p.confidence = 'exact') desc limit 1
    ) pr on true
    -- The ::text[] cast is required. Without it Drizzle inlines the JS array
    -- as a parenthesised tuple rather than an array, and Postgres rejects it:
    -- any() takes an array, not a row constructor.
    where c.id = any(${sql.param(ids)}::text[])
  `);

  const byId = new Map(detail.rows.map((row) => [row.cardId, row]));
  const candidates: ScanCandidate[] = [];
  for (const row of top) {
    const card = byId.get(row.cardId);
    if (!card) continue;
    candidates.push({
      cardId: card.cardId,
      name: card.name,
      localId: card.localId,
      setId: card.setId,
      setName: card.setName,
      setLanguage: card.setLanguage,
      setCode: card.setCode,
      imageBaseUrl: card.imageBaseUrl,
      rarity: card.rarity,
      defaultVariantId: card.defaultVariantId,
      distance: row.distance,
      price:
        card.priceMarket && card.priceCurrency
          ? {
              minor: Math.round(Number(card.priceMarket) * 100),
              currency: card.priceCurrency,
            }
          : null,
    });
  }

  return { candidates, confident, margin, indexSize: index.length };
}

/** Coverage, for the admin panel and the scan page's own empty state. */
export async function getScanIndexStats(): Promise<{ total: number; hashed: number }> {
  const rows = await db.execute<SqlRow<{ total: number; hashed: number }>>(sql`
    select count(*)::int as total, count(image_phash)::int as hashed
    from card where image_base_url is not null
  `);
  const row = rows.rows[0];
  return { total: Number(row?.total ?? 0), hashed: Number(row?.hashed ?? 0) };
}
