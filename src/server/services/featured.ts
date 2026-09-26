import { sql } from 'drizzle-orm';
import { db, type SqlRow } from '@/db';
import type { Currency } from '@/db/schema/enums';
import { convert, money, type FxRates, type Money } from '@/lib/pricing/money';
import { SUBSET_IDS, setIdWithSubsets } from '@/lib/catalog/subsets';
import { memoAsync } from '@/lib/memo';
import { getFxRates } from './fx';

/**
 * The shelves on the home page.
 *
 * A collection tracker that opens on an empty dashboard tells a first-time
 * visitor nothing about what it is. These rails put actual cards and actual
 * prices on the first screen, the way a shop puts stock in the window.
 *
 * Each rail is the most valuable cards of something a collector recognises -
 * the anniversary set, Base Set, the whole catalogue - because value is what
 * makes a row worth scrolling. A rail that comes back empty is dropped rather
 * than rendered as a gap, so a half-synced instance degrades quietly.
 */

export interface FeaturedCard {
  cardId: string;
  name: string;
  localId: string;
  imageBaseUrl: string | null;
  setId: string;
  setName: string;
  price: Money | null;
}

export interface FeaturedRail {
  /** Message key under `home.rail`, or null when the set's own name is the title. */
  labelKey: string | null;
  title: string;
  href: string;
  cards: FeaturedCard[];
}

interface RawRow {
  cardId: string;
  name: string;
  localId: string;
  imageBaseUrl: string | null;
  setId: string;
  setName: string;
  market: string | null;
  currency: Currency | null;
}

function toCards(rows: RawRow[], displayCurrency: Currency, rates: FxRates): FeaturedCard[] {
  return rows.map((row) => ({
    cardId: row.cardId,
    name: row.name,
    localId: row.localId,
    imageBaseUrl: row.imageBaseUrl,
    setId: row.setId,
    setName: row.setName,
    price:
      row.market && row.currency
        ? convert(money(Number(row.market), row.currency), displayCurrency, rates)
        : null,
  }));
}

/**
 * Most valuable cards of one or more sets, or of the whole catalogue.
 *
 * Ordered by price with unpriced cards last rather than excluded: a brand new
 * set has no prices for a few days after release, and showing it empty would
 * be worse than showing the cards without a figure.
 */
async function topCards(
  cardLanguage: string,
  options: { setIds?: string[]; limit: number },
): Promise<RawRow[]> {
  const scope = options.setIds?.length
    ? sql`c.set_id = any(${sql.param(options.setIds)}::text[])`
    : sql`true`;

  const result = await db.execute<SqlRow<RawRow>>(sql`
    select
      c.id                                          as "cardId",
      coalesce(ct.name, c.name)                     as "name",
      coalesce(ct.local_id, c.local_id)             as "localId",
      coalesce(ct.image_base_url, c.image_base_url, c.fallback_image_url) as "imageBaseUrl",
      c.set_id                                      as "setId",
      coalesce(st.name, s.name)                     as "setName",
      pr.market::text                               as "market",
      pr.currency                                   as "currency"
    from card c
    join set s on s.id = c.set_id
    left join set_translation st
      on st.set_id = s.id and st.language = ${cardLanguage}::card_language
    left join card_translation ct
      on ct.card_id = c.id and ct.language = ${cardLanguage}::card_language
    left join lateral (
      select p.market, p.currency
      from card_variant v
      join card_price p on p.card_variant_id = v.id
      where v.card_id = c.id and p.market is not null
      order by p.market desc
      limit 1
    ) pr on true
    where ${scope}
      and coalesce(ct.image_base_url, c.image_base_url, c.fallback_image_url) is not null
    order by pr.market desc nulls last, c.sort_index asc
    limit ${options.limit}
  `);
  return result.rows;
}

/**
 * Sets worth putting on the front page, newest first.
 *
 * Picked from the catalogue rather than hard-coded, so the shelf follows the
 * game instead of needing a code change every release.
 */
async function recentSets(cardLanguage: string, limit: number) {
  const result = await db.execute<SqlRow<{ id: string; name: string }>>(sql`
    select s.id, coalesce(st.name, s.name) as name
    from set s
    left join set_translation st
      on st.set_id = s.id and st.language = ${cardLanguage}::card_language
    where s.origin_language = 'en'
      and s.release_date is not null
      -- Never headline a Trainer Gallery as "the newest set": it shares its
      -- parent's date and is part of it.
      and s.id <> all(${sql.param(SUBSET_IDS)}::text[])
      and exists (select 1 from card c where c.set_id = s.id)
    order by s.release_date desc
    limit ${limit}
  `);
  return result.rows;
}

async function namedSets(cardLanguage: string, ids: readonly string[]) {
  const result = await db.execute<SqlRow<{ id: string; name: string }>>(sql`
    select s.id, coalesce(st.name, s.name) as name
    from set s
    left join set_translation st
      on st.set_id = s.id and st.language = ${cardLanguage}::card_language
    where s.id = any(${sql.param(ids)}::text[])
  `);
  return new Map(result.rows.map((set) => [set.id, set.name]));
}

async function buildFeaturedRails(
  cardLanguage: string,
  displayCurrency: Currency,
): Promise<FeaturedRail[]> {
  const rates = await getFxRates();
  const rails: FeaturedRail[] = [];

  const [newest] = await recentSets(cardLanguage, 1);
  const requested = ['swsh11', 'swsh7', 'swsh10.5'] as const;
  const [headline, lostOrigin, evolvingSkies, pokemonGo, vintage, overall, setNames] = await Promise.all([
    newest ? topCards(cardLanguage, { setIds: [newest.id], limit: 12 }) : Promise.resolve([]),
    topCards(cardLanguage, { setIds: setIdWithSubsets('swsh11'), limit: 12 }),
    topCards(cardLanguage, { setIds: setIdWithSubsets('swsh7'), limit: 12 }),
    topCards(cardLanguage, { setIds: setIdWithSubsets('swsh10.5'), limit: 12 }),
    topCards(cardLanguage, { setIds: ['base1'], limit: 12 }),
    topCards(cardLanguage, { limit: 12 }),
    namedSets(cardLanguage, requested),
  ]);

  if (newest && headline.length > 0) {
    rails.push({
      labelKey: null,
      title: newest.name,
      href: `/sets/${newest.id}`,
      cards: toCards(headline, displayCurrency, rates),
    });
  }

  for (const [setId, cards] of [
    ['swsh11', lostOrigin],
    ['swsh7', evolvingSkies],
    ['swsh10.5', pokemonGo],
  ] as const) {
    const title = setNames.get(setId);
    if (title && cards.length > 0 && newest?.id !== setId) {
      rails.push({
        labelKey: null,
        title,
        href: `/sets/${setId}`,
        cards: toCards(cards, displayCurrency, rates),
      });
    }
  }

  if (vintage.length > 0) {
    rails.push({
      labelKey: 'baseSet',
      title: '',
      href: '/sets/base1',
      cards: toCards(vintage, displayCurrency, rates),
    });
  }

  if (overall.length > 0) {
    rails.push({
      labelKey: 'mostValuable',
      title: '',
      // Not the search box: the rail already said these are the expensive
      // ones, so "see all" should show the rest of them, not ask for a query.
      href: '/top',
      cards: toCards(overall, displayCurrency, rates),
    });
  }

  return rails;
}


/**
 * The rails, cached.
 *
 * Nothing here depends on who is asking, and it changes once a day when the
 * price sync runs - yet building it cost about a second of server time on
 * every visit to the landing page, because picking the most valuable cards
 * means a lateral price lookup across the whole catalogue followed by a
 * sort.
 *
 * Fifteen minutes is far shorter than the data's real lifetime; it is short
 * enough that a manual price import shows up without a restart, and long
 * enough that essentially nobody pays for the query.
 */
export const getFeaturedRails = memoAsync(buildFeaturedRails, {
  ttlMs: 15 * 60 * 1000,
  key: (cardLanguage, displayCurrency) => `${cardLanguage}:${displayCurrency}`,
  name: 'featuredRails',
});
