import { sql } from 'drizzle-orm';
import { db } from '@/db';
import type { CardLanguage, Currency, PriceConfidence } from '@/db/schema/enums';
import type { Money } from '@/lib/pricing/money';
import type { CardTileVariant } from './catalog';
import { getFxRates } from './fx';
import { SUBSET_IDS } from '@/lib/catalog/subsets';

/**
 * Global search.
 *
 * One statement, ranked, over ~24,000 cards times their translations. Three
 * things keep it fast at that size:
 *  - trigram GIN indexes on `card.name` and `card_translation.name`, so
 *    `ilike '%pika%'` is an index scan rather than a sequential one;
 *  - an exact-match fast path for a card number or set code, which is what a
 *    collector standing in front of a binder actually types;
 *  - keyset-friendly LIMIT/OFFSET with a windowed total, so the client never
 *    needs a second count query.
 */

export interface SearchFilters {
  query: string;
  userId?: string | null;
  cardLanguage: CardLanguage;
  displayCurrency: Currency;
  ownership?: 'all' | 'owned' | 'missing';
  setId?: string[];
  eraId?: string[];
  rarity?: string[];
  variantType?: string[];
  printedLanguage?: string[];
  minPrice?: number;
  maxPrice?: number;
  /**
   * `relevance` ranks by how well the name matches, which is meaningless
   * with an empty query. `price` is for browsing rather than looking for
   * something: most valuable first, regardless of name.
   */
  sort?: 'relevance' | 'price';
  limit?: number;
  offset?: number;
}

interface RawVariant {
  id: string;
  variantType: CardTileVariant['variantType'];
  size: string;
  market: string | null;
  currency: Currency | null;
}

export interface SearchHit {
  id: string;
  name: string;
  localId: string;
  imageBaseUrl: string | null;
  rarity: string | null;
  illustrator: string | null;
  setId: string;
  setName: string;
  setCode: string | null;
  quantity: number;
  wishlisted: boolean;
  variants: CardTileVariant[];
  defaultVariantId: string | null;
  price: Money | null;
  priceConfidence: PriceConfidence | null;
  rank: number;
}

export async function searchCards(
  filters: SearchFilters,
): Promise<{ hits: SearchHit[]; total: number }> {
  const {
    query,
    userId = null,
    cardLanguage,
    displayCurrency,
    ownership = 'all',
    sort = 'relevance',
    limit = 40,
    offset = 0,
  } = filters;

  const trimmed = query.trim();
  /**
   * An empty query is only meaningless when ranking by relevance.
   *
   * Sorted by price it is a browse - "show me the expensive ones" - which
   * is exactly what the most-valuable page asks for, and it used to come
   * back empty because this returned early before looking at the filters.
   */
  if (trimmed.length === 0 && sort !== 'price') return { hits: [], total: 0 };

  const rates = await getFxRates();

  // Matching is per word (below); ranking still looks at the whole phrase,
  // so an exact title typed in full outranks a card that merely contains
  // each of its words somewhere.
  const prefix = `${trimmed}%`;

  /**
   * Every word has to match something, but each may match a different thing.
   *
   * The query used to be one string tested against each field, so "pikachu TG"
   * looked for a card literally named that and found nothing - even though
   * every Trainer Gallery Pikachu matches "pikachu" on its name and "TG" on
   * its number. Splitting into words and requiring all of them lets a
   * collector type what they actually have in their head: a name, a set, a
   * number, or any mixture.
   *
   * Capped at six words so a pasted sentence cannot build an enormous query.
   */
  const tokens = trimmed.split(/\s+/).filter(Boolean).slice(0, 6);

  const conditions = tokens.map((token) => {
    const like = `%${token}%`;
    const prefix = `${token}%`;
    // "025/165" is one word to a person and two numbers to a database; the
    // part before the slash is the collector number.
    const numberPart = token.split('/')[0] ?? token;

    return sql`(
      c.name ilike ${like}
      or ct.name ilike ${like}
      -- Match a printed name in ANY language, not just the one being
      -- displayed. Without this a French collector on an English UI cannot
      -- find "Dracaufeu". Display still uses the chosen language; only
      -- matching is language-agnostic.
      or exists (
        select 1 from card_translation tx
        where tx.card_id = c.id and tx.name ilike ${like}
      )
      -- Prefix rather than equality, so "TG" finds TG01 through TG30 and
      -- "SWSH" finds the promo run.
      or c.local_id ilike ${prefix}
      or c.local_id = ${numberPart}
      or c.illustrator ilike ${like}
      or c.rarity ilike ${like}
      or s.name ilike ${like}
      or s.id ilike ${prefix}
      or s.code ilike ${token}
      or se.name ilike ${like}
      or exists (
        select 1 from set_translation sx
        where sx.set_id = s.id and sx.name ilike ${like}
      )
    )`;
  });

  if (filters.setId?.length) conditions.push(sql`c.set_id = any(${sql.param(filters.setId)}::text[])`);
  if (filters.eraId?.length) conditions.push(sql`se.era_id = any(${sql.param(filters.eraId)}::text[])`);
  if (filters.rarity?.length) conditions.push(sql`c.rarity = any(${sql.param(filters.rarity)}::text[])`);
  if (filters.printedLanguage?.length) {
    conditions.push(
      sql`exists (select 1 from card_translation t where t.card_id = c.id and t.language = any(${sql.param(filters.printedLanguage)}::card_language[]))`,
    );
  }
  if (filters.variantType?.length) {
    conditions.push(
      sql`exists (select 1 from card_variant v2 where v2.card_id = c.id and v2.variant_type = any(${sql.param(filters.variantType)}::variant_type[]))`,
    );
  }
  if (ownership === 'owned') {
    conditions.push(sql`exists (select 1 from collection_item ci where ci.user_id = ${userId} and ci.card_id = c.id)`);
  } else if (ownership === 'missing') {
    conditions.push(sql`not exists (select 1 from collection_item ci where ci.user_id = ${userId} and ci.card_id = c.id)`);
  }
  /**
   * Price filters and price ordering read the precomputed column.
   *
   * `pr.market` is a lateral evaluated per row, so filtering or sorting on
   * it forces the provider-preference lookup across the whole catalogue -
   * 33,807 laterals and half a second before anything can be ordered. The
   * same number lives in `card_best_price`, maintained by the sync jobs
   * with an identical rule, where it is one indexed column.
   */
  if (filters.minPrice !== undefined) conditions.push(sql`bp.market >= ${filters.minPrice}`);
  if (filters.maxPrice !== undefined) conditions.push(sql`bp.market <= ${filters.maxPrice}`);

  // Browsing with no text and no filters leaves nothing to join, and an
  // empty WHERE clause is a syntax error rather than "everything".
  const matchAll = conditions.length > 0 ? sql.join(conditions, sql` and `) : sql`true`;

  const result = await db.execute<
    Omit<SearchHit, 'price'> & { priceMarket: string | null; priceCurrency: Currency | null; total: number }
  >(sql`
    select
      c.id,
      coalesce(ct.name, c.name) as "name",
      coalesce(ct.local_id, c.local_id) as "localId",
      coalesce(ct.image_base_url, c.image_base_url, c.fallback_image_url) as "imageBaseUrl",
      c.rarity, c.illustrator,
      c.set_id as "setId",
      coalesce(st.name, s.name) as "setName",
      s.code as "setCode",
      coalesce((
        select sum(ci.quantity)::int from collection_item ci
        where ci.user_id = ${userId} and ci.card_id = c.id
      ), 0) as "quantity",
      exists(
        select 1 from wishlist_item wi
        where wi.user_id = ${userId} and wi.card_id = c.id
      ) as "wishlisted",
      dv.id as "defaultVariantId",
      -- Same reasoning as the set grid: a reverse holo is a different card
      -- to own and a different price, so the choice has to reach the tile.
      (
        select json_agg(json_build_object(
          'id', v.id,
          'variantType', v.variant_type,
          'size', v.size,
          'market', vp.market::text,
          'currency', vp.currency
        ) order by v.is_default desc, v.variant_type)
        from card_variant v
        left join lateral (
          select p.market, p.currency from card_price p
          where p.card_variant_id = v.id and p.market is not null
          order by (p.confidence = 'exact') desc,
                   array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'], p.provider) nulls last
          limit 1
        ) vp on true
        where v.card_id = c.id
      ) as "variants",
      pr.market::text as "priceMarket",
      pr.currency as "priceCurrency",
      pr.confidence as "priceConfidence",
      (
        case when lower(coalesce(ct.name, c.name)) = lower(${trimmed}) then 100
             when c.local_id = ${trimmed} then 90
             when coalesce(ct.name, c.name) ilike ${prefix} then 70
             when exists (
                    select 1 from card_translation tx
                    where tx.card_id = c.id and lower(tx.name) = lower(${trimmed})
                  ) then 85
             when c.illustrator ilike ${prefix} then 40
             when s.name ilike ${prefix} then 30
             else 10 end
      )::int as "rank",
      count(*) over ()::int as "total"
    from card c
    join set s on s.id = c.set_id
    join series se on se.id = s.series_id
    left join set_translation st on st.set_id = s.id and st.language = ${cardLanguage}
    left join card_translation ct on ct.card_id = c.id and ct.language = ${cardLanguage}
    left join lateral (
      select v.id from card_variant v where v.card_id = c.id
      order by v.is_default desc, v.variant_type limit 1
    ) dv on true
    left join card_best_price bp on bp.card_id = c.id
    left join lateral (
      select p.market, p.currency, p.confidence from card_price p
      where p.card_variant_id = dv.id and p.market is not null
      order by (p.confidence = 'exact') desc,
               array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'], p.provider) nulls last
      limit 1
    ) pr on true
    where ${matchAll}
    ${
      sort === 'price'
        ? sql`order by bp.market desc nulls last, s.release_date desc nulls last, c.sort_index`
        : sql`order by "rank" desc, pr.market desc nulls last, s.release_date desc nulls last, c.sort_index`
    }
    limit ${limit} offset ${offset}
  `);

  const hits = result.rows.map<SearchHit>((row) => ({
    id: row.id,
    name: row.name,
    localId: row.localId,
    imageBaseUrl: row.imageBaseUrl,
    rarity: row.rarity,
    illustrator: row.illustrator,
    setId: row.setId,
    setName: row.setName,
    setCode: row.setCode,
    quantity: Number(row.quantity),
    wishlisted: Boolean(row.wishlisted),
    variants: ((row as unknown as { variants: RawVariant[] | null }).variants ?? []).map(
      (variant) => ({
        id: variant.id,
        variantType: variant.variantType,
        size: variant.size,
        price:
          variant.market && variant.currency
            ? convert(Number(variant.market), variant.currency, displayCurrency, rates)
            : null,
      }),
    ),
    defaultVariantId: row.defaultVariantId,
    priceConfidence: row.priceConfidence,
    rank: Number(row.rank),
    price:
      row.priceMarket && row.priceCurrency
        ? convert(Number(row.priceMarket), row.priceCurrency, displayCurrency, rates)
        : null,
  }));

  return { hits, total: Number(result.rows[0]?.total ?? 0) };
}

function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Record<string, number>,
): Money {
  if (from === to) return { minor: Math.round(amount * 100), currency: to };
  return { minor: Math.round(amount * 100 * (rates[`${from}:${to}`] ?? 1)), currency: to };
}

/** Sets matching a free-text query, for the second tab of the search page. */
export async function searchSets(query: string, cardLanguage: CardLanguage, limit = 12) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const like = `%${trimmed}%`;

  const result = await db.execute<{
    id: string;
    name: string;
    logoUrl: string | null;
    releaseDate: string | null;
    cardCountTotal: number;
    seriesName: string;
  }>(sql`
    select s.id, coalesce(st.name, s.name) as name,
           coalesce(st.logo_url, s.logo_url) as "logoUrl",
           s.release_date::text as "releaseDate",
           s.card_count_total as "cardCountTotal",
           se.name as "seriesName"
    from set s
    join series se on se.id = s.series_id
    left join set_translation st on st.set_id = s.id and st.language = ${cardLanguage}
    where (s.name ilike ${like} or st.name ilike ${like} or s.id ilike ${like} or s.code ilike ${trimmed})
      -- A Trainer Gallery is part of its set, not a result beside it.
      and s.id <> all(${sql.param(SUBSET_IDS)}::text[])
    order by s.release_date desc nulls last
    limit ${limit}
  `);
  return result.rows;
}

/** Distinct rarities across the catalog, for filter menus. */
export async function listRarities(): Promise<string[]> {
  const result = await db.execute<{ rarity: string }>(
    sql`select distinct rarity from card where rarity is not null order by rarity`,
  );
  return result.rows.map((r) => r.rarity);
}
