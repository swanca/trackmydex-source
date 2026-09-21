import { sql } from 'drizzle-orm';
import { db, type SqlRow } from '@/db';
import type { CardLanguage, Condition, Currency } from '@/db/schema/enums';
import { type FxRates, type Money } from '@/lib/pricing/money';
import { valueStack, type StoredPrice } from '@/lib/pricing/select';
import { getFxRates } from './fx';
import { parentSetId, SUBSET_PAIRS } from '@/lib/catalog/subsets';

/**
 * A collection, arranged the way collectors think about it: by set.
 *
 * A flat list of every card is unreadable past a few hundred rows, and it
 * answers none of the questions people actually have - how far into this set
 * am I, what is this set worth. Each set collapses to one line carrying its
 * count and its value, and opens to show the cards.
 *
 * Sets with nothing in them are never listed. A tracker that shows "0 / 30"
 * for every set a collector does not own turns their own collection into a
 * wall of zeroes.
 */

export interface GroupedCard {
  id: string;
  cardId: string;
  cardName: string;
  localId: string;
  imageBaseUrl: string | null;
  variantId: string;
  variantType: string;
  language: string;
  condition: string;
  quantity: number;
  /** Condition/language adjusted value of one copy, used for comparable sorting. */
  unitValue: Money | null;
  value: Money | null;
}

export interface CollectionSetGroup {
  setId: string;
  setName: string;
  setLogoUrl: string | null;
  setCode: string | null;
  releaseDate: string | null;
  /** Cards held, counted as distinct printings rather than copies. */
  uniqueCards: number;
  totalCards: number;
  /** How many cards the set contains, for the "12 of 165" line. */
  setSize: number;
  value: Money;
  cards: GroupedCard[];
}

export interface GroupedCollection {
  /** Sets from the western releases, the ones most collectors start with. */
  main: CollectionSetGroup[];
  /**
   * Japanese and other Asian-only releases, kept in their own section.
   *
   * They are their own sets with their own numbering, and for most collectors
   * they are a separate pursuit - listed inline they double the length of the
   * page and bury the sets being actively worked on.
   */
  asian: CollectionSetGroup[];
}

export interface CollectionGroupSourceRow {
  id: string;
  cardId: string;
  cardName: string;
  localId: string;
  imageBaseUrl: string | null;
  variantId: string;
  variantType: string;
  language: string;
  condition: Condition;
  quantity: number;
  setId: string;
  setName: string;
  setLogoUrl: string | null;
  setCode: string | null;
  setSize: number;
  releaseDate: string | null;
  originLanguage: string;
  setLanguages: CardLanguage[];
  sortIndex: number;
  price: StoredPrice | null;
}

interface RawRow extends Omit<CollectionGroupSourceRow, 'price'> {
  priceProvider: string | null;
  priceCurrency: Currency | null;
  priceMarket: string | null;
  priceConfidence: 'exact' | 'approximate' | null;
  priceReason: string | null;
  priceUrl: string | null;
  priceFetchedAt: Date | null;
}

export async function listCollectionBySet(
  userId: string,
  cardLanguage: CardLanguage,
  displayCurrency: Currency,
): Promise<GroupedCollection> {
  const rates: FxRates = await getFxRates();

  const result = await db.execute<SqlRow<RawRow>>(sql`
    select
      ci.id,
      ci.card_id                                    as "cardId",
      coalesce(ct.name, c.name)                     as "cardName",
      coalesce(ct.local_id, c.local_id)             as "localId",
      coalesce(ct.image_base_url, c.image_base_url, c.fallback_image_url) as "imageBaseUrl",
      ci.card_variant_id                            as "variantId",
      v.variant_type                                as "variantType",
      ci.language, ci.condition, ci.quantity,
      s.id                                          as "setId",
      coalesce(st.name, s.name)                     as "setName",
      s.logo_url                                    as "setLogoUrl",
      s.code                                        as "setCode",
      (s.card_count_total + coalesce((
        select sum(child.card_count_total)::int
        from set child
        join (values ${sql.join(
          SUBSET_PAIRS.map((pair) => sql`(${pair[0]}, ${pair[1]})`),
          sql`, `,
        )}) as subset_size(child, parent) on subset_size.child = child.id
        where subset_size.parent = s.id
      ), 0))                                         as "setSize",
      s.release_date::text                          as "releaseDate",
      s.origin_language                             as "originLanguage",
      s.languages::text[]                          as "setLanguages",
      c.sort_index                                  as "sortIndex",
      pr.provider                                   as "priceProvider",
      pr.market::text                               as "priceMarket",
      pr.currency                                   as "priceCurrency",
      pr.confidence                                 as "priceConfidence",
      pr.approximation_reason                       as "priceReason",
      pr.source_url                                 as "priceUrl",
      pr.fetched_at                                 as "priceFetchedAt"
    from collection_item ci
    join card c on c.id = ci.card_id
    join card_variant v on v.id = ci.card_variant_id
    -- A Trainer Gallery card belongs to its parent set, so it groups under
    -- it here too. Without this, somebody who added TG cards saw a separate
    -- "Lost Origin Trainer Gallery" block beside their Lost Origin one.
    left join (values ${sql.join(
      SUBSET_PAIRS.map((pair) => sql`(${pair[0]}, ${pair[1]})`),
      sql`, `,
    )}) as sub(child, parent) on sub.child = c.set_id
    join set s on s.id = coalesce(sub.parent, c.set_id)
    left join set_translation st
      on st.set_id = s.id and st.language = ${cardLanguage}::card_language
    left join card_translation ct
      on ct.card_id = c.id and ct.language = ${cardLanguage}::card_language
    left join lateral (
      select p.provider, p.market, p.currency, p.confidence,
             p.approximation_reason, p.source_url, p.fetched_at
      from card_price p
      where p.card_variant_id = ci.card_variant_id and p.market is not null
      order by (p.confidence = 'exact') desc,
               array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'], p.provider) nulls last
      limit 1
    ) pr on true
    where ci.user_id = ${userId}
    order by s.release_date desc nulls last, s.id, c.sort_index
  `);

  const rows: CollectionGroupSourceRow[] = result.rows.map((row) => ({
    ...row,
    setLanguages: row.setLanguages ?? [],
    price: row.priceProvider && row.priceCurrency
      ? {
          provider: row.priceProvider,
          currency: row.priceCurrency,
          market: row.priceMarket,
          confidence: row.priceConfidence ?? 'approximate',
          approximationReason: row.priceReason,
          sourceUrl: row.priceUrl,
          fetchedAt: row.priceFetchedAt ?? new Date(),
        }
      : null,
  }));

  return buildCollectionGroups(rows, displayCurrency, rates);
}

export function buildCollectionGroups(
  rows: readonly CollectionGroupSourceRow[],
  displayCurrency: Currency,
  rates: FxRates,
): GroupedCollection {
  const groups = new Map<string, CollectionSetGroup & { originLanguage: string }>();

  for (const row of rows) {
    const quantity = Number(row.quantity);
    const valuation = row.price
      ? valueStack(
          {
            prices: [row.price],
            quantity,
            condition: row.condition,
            language: row.language as CardLanguage,
            setOriginLanguage: row.originLanguage as CardLanguage,
            setLanguages: row.setLanguages,
          },
          displayCurrency,
          rates,
        )
      : null;
    const value = valuation && valuation.total.minor > 0 ? valuation.total : null;
    const unitValue = valuation && valuation.unit.minor > 0 ? valuation.unit : null;
    const groupedSetId = parentSetId(row.setId) ?? row.setId;

    let group = groups.get(groupedSetId);
    if (!group) {
      group = {
        setId: groupedSetId,
        setName: row.setName,
        setLogoUrl: row.setLogoUrl,
        setCode: row.setCode,
        releaseDate: row.releaseDate,
        uniqueCards: 0,
        totalCards: 0,
        setSize: Number(row.setSize ?? 0),
        value: { minor: 0, currency: displayCurrency },
        cards: [],
        originLanguage: row.originLanguage,
      };
      groups.set(groupedSetId, group);
    }

    group.uniqueCards += 1;
    group.totalCards += quantity;
    if (value) group.value = { minor: group.value.minor + value.minor, currency: displayCurrency };

    group.cards.push({
      id: row.id,
      cardId: row.cardId,
      cardName: row.cardName,
      localId: row.localId,
      imageBaseUrl: row.imageBaseUrl,
      variantId: row.variantId,
      variantType: row.variantType,
      language: row.language,
      condition: row.condition,
      quantity,
      unitValue,
      value,
    });
  }

  const all = [...groups.values()].sort((a, b) => b.value.minor - a.value.minor);
  const asianOnly = new Set(['ja', 'ko', 'zh-tw', 'zh-cn']);

  return {
    main: all.filter((g) => !asianOnly.has(g.originLanguage)),
    asian: all.filter((g) => asianOnly.has(g.originLanguage)),
  };
}
