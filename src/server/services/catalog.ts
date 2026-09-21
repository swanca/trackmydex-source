import { sql } from 'drizzle-orm';
import { db, type SqlRow } from '@/db';
import type { CardLanguage, Condition, Currency, PriceConfidence, VariantType } from '@/db/schema/enums';
import type { Money } from '@/lib/pricing/money';
import { valueStack, pickPrice, type StoredPrice } from '@/lib/pricing/select';
import { SUBSET_IDS, SUBSET_PAIRS, parentSetId, setIdWithSubsets } from '@/lib/catalog/subsets';
import { getFxRates } from './fx';

/**
 * Catalog reads.
 *
 * Every query here is written so the browser receives a page of rows, never the
 * catalog: set pages paginate, ownership is resolved with an EXISTS rather than a
 * client-side join, and price selection happens in a LATERAL so one card costs
 * one row.
 */

export interface EraNode {
  id: string;
  name: string;
  startYear: number;
  endYear: number | null;
  setCount: number;
  cardCount: number;
  ownedCount: number;
  value: Money | null;
}

export interface SetNode {
  id: string;
  seriesId: string;
  seriesName: string;
  eraId: string;
  name: string;
  code: string | null;
  releaseDate: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
  cardCountTotal: number;
  cardCountOfficial: number;
  languages: CardLanguage[];
  ownedCount: number;
  value: Money | null;
}

interface SetRow {
  id: string;
  seriesId: string;
  seriesName: string;
  eraId: string;
  eraName: string;
  eraStartYear: number;
  eraEndYear: number | null;
  eraSortOrder: number;
  name: string;
  code: string | null;
  releaseDate: string | null;
  logoUrl: string | null;
  symbolUrl: string | null;
  cardCountTotal: number;
  cardCountOfficial: number;
  languages: CardLanguage[] | null;
  ownedCount: number;
  ownedValueEur: string | null;
  ownedValueUsd: string | null;
}

/**
 * All sets with the signed-in user's progress.
 *
 * `ownedCount` counts distinct *cards* owned, not copies: a set page shows
 * "98 / 100", and owning four Furrets does not make that 101.
 *
 * Value is aggregated per currency in SQL and converted once in TypeScript, so a
 * mixed-marketplace collection does not need a rate inside the query.
 */
export async function listSetsWithProgress(
  userId: string | null,
  displayCurrency: Currency,
  options: {
    /** Names are shown in this language where a translation exists. */
    translateTo?: CardLanguage;
    /** Optional: restrict to sets actually printed in this language. */
    printedIn?: CardLanguage;
  } = {},
): Promise<{ eras: EraNode[]; sets: SetNode[] }> {
  /**
   * Translating and filtering are separate.
   *
   * They used to be one parameter, which meant asking for French names also
   * hid every set not printed in French - 388 sets became 202, and the names
   * stayed English anyway because nothing was ever joined.
   */
  const translateTo = options.translateTo ?? null;
  const printedIn = options.printedIn ?? null;
  const rates = await getFxRates();

  const result = await db.execute<SqlRow<SetRow>>(sql`
    with owned as (
      select c.set_id,
             count(distinct ci.card_id)::int as owned_count,
             sum(case when pr.currency = 'EUR' then pr.market * ci.quantity else 0 end) as value_eur,
             sum(case when pr.currency = 'USD' then pr.market * ci.quantity else 0 end) as value_usd
      from collection_item ci
      join card c on c.id = ci.card_id
      left join lateral (
        select p.currency, p.market
        from card_price p
        where p.card_variant_id = ci.card_variant_id and p.market is not null
        order by (p.confidence = 'exact') desc,
                 array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'], p.provider) nulls last
        limit 1
      ) pr on true
      where ci.user_id = ${userId}
      group by c.set_id
    )
    select
      s.id, s.series_id as "seriesId", se.name as "seriesName",
      se.era_id as "eraId", e.name as "eraName",
      e.start_year as "eraStartYear", e.end_year as "eraEndYear", e.sort_order as "eraSortOrder",
      coalesce(st.name, s.name) as "name",
      s.code, s.release_date::text as "releaseDate",
      s.logo_url as "logoUrl", s.symbol_url as "symbolUrl",
      s.card_count_total as "cardCountTotal", s.card_count_official as "cardCountOfficial",
      -- Cast: card_language[] is a custom enum array and node-postgres has no
      -- parser for its OID, so it would arrive as the literal string '{en,fr}'.
      s.languages::text[] as "languages",
      coalesce(o.owned_count, 0) as "ownedCount",
      o.value_eur::text as "ownedValueEur",
      o.value_usd::text as "ownedValueUsd"
    from set s
    join series se on se.id = s.series_id
    join era e on e.id = se.era_id
    left join owned o on o.set_id = s.id
    ${
      translateTo
        ? sql`left join set_translation st
                on st.set_id = s.id and st.language = ${translateTo}::card_language`
        : sql`left join set_translation st on false`
    }
    ${printedIn ? sql`where s.languages @> array[${printedIn}]::card_language[]` : sql``}
    -- Newest first. Somebody is far more likely to be working on the set
    -- that came out this month than on one from 1999.
    order by e.sort_order desc, s.release_date desc nulls last, s.name
  `);

  const allSets: SetNode[] = result.rows.map((row) => ({
    id: row.id,
    seriesId: row.seriesId,
    seriesName: row.seriesName,
    eraId: row.eraId,
    name: row.name,
    code: row.code,
    releaseDate: row.releaseDate,
    logoUrl: row.logoUrl,
    symbolUrl: row.symbolUrl,
    cardCountTotal: Number(row.cardCountTotal),
    cardCountOfficial: Number(row.cardCountOfficial),
    languages: row.languages ?? [],
    ownedCount: Number(row.ownedCount),
    value: combineValue(row.ownedValueEur, row.ownedValueUsd, displayCurrency, rates),
  }));

  /**
   * A Trainer Gallery is part of its set, not a set beside it.
   *
   * Upstream publishes them separately, so the browser showed "Lost Origin"
   * and "Lost Origin Trainer Gallery" as siblings with near-identical names.
   * Folding the counts into the parent makes the progress bar describe the
   * master set, which is what somebody completing it is actually tracking.
   */
  const byId = new Map(allSets.map((set) => [set.id, set]));
  const sets: SetNode[] = [];
  for (const set of allSets) {
    const parentId = parentSetId(set.id);
    const parent = parentId ? byId.get(parentId) : undefined;
    if (!parent) {
      sets.push(set);
      continue;
    }
    parent.cardCountTotal += set.cardCountTotal;
    parent.cardCountOfficial += set.cardCountOfficial;
    parent.ownedCount += set.ownedCount;
    if (set.value) {
      parent.value = parent.value
        ? { ...parent.value, minor: parent.value.minor + set.value.minor }
        : set.value;
    }
  }

  const eraMap = new Map<string, EraNode>();
  const eraMeta = new Map(
    result.rows.map((row) => [
      row.eraId,
      {
        name: row.eraName,
        startYear: Number(row.eraStartYear),
        endYear: row.eraEndYear === null ? null : Number(row.eraEndYear),
      },
    ]),
  );
  // Counted from the merged list, so a subset is not tallied twice.
  for (const set of sets) {
    const meta = eraMeta.get(set.eraId);
    if (!meta) continue;
    const existing = eraMap.get(set.eraId) ?? {
      id: set.eraId,
      name: meta.name,
      startYear: meta.startYear,
      endYear: meta.endYear,
      setCount: 0,
      cardCount: 0,
      ownedCount: 0,
      value: { minor: 0, currency: displayCurrency } as Money,
    };
    existing.setCount += 1;
    existing.cardCount += set.cardCountTotal;
    existing.ownedCount += set.ownedCount;
    if (set.value && existing.value) {
      existing.value = { ...existing.value, minor: existing.value.minor + set.value.minor };
    }
    eraMap.set(set.eraId, existing);
  }

  return { eras: [...eraMap.values()], sets };
}

function combineValue(
  eur: string | null,
  usd: string | null,
  target: Currency,
  rates: Record<string, number>,
): Money | null {
  const eurValue = eur ? Number(eur) : 0;
  const usdValue = usd ? Number(usd) : 0;
  if (!eurValue && !usdValue) return null;

  let minor = 0;
  if (eurValue) {
    minor += target === 'EUR' ? Math.round(eurValue * 100) : Math.round(eurValue * 100 * (rates['EUR:USD'] ?? 1));
  }
  if (usdValue) {
    minor += target === 'USD' ? Math.round(usdValue * 100) : Math.round(usdValue * 100 * (rates['USD:EUR'] ?? 1));
  }
  return { minor, currency: target };
}

export interface SetDetail extends SetNode {
  legalStandard: boolean;
  legalExpanded: boolean;
  localizedName: string;
}

export async function getSetDetail(
  setId: string,
  userId: string | null,
  displayCurrency: Currency,
  cardLanguage: CardLanguage,
): Promise<SetDetail | null> {
  // The set and anything printed inside it - Trainer Galleries and the like.
  const memberIds = setIdWithSubsets(setId);
  const rates = await getFxRates();
  const result = await db.execute<SqlRow<SetRow & { legalStandard: boolean; legalExpanded: boolean; localizedName: string }>>(sql`
    select
      s.id, s.series_id as "seriesId", se.name as "seriesName",
      se.era_id as "eraId", e.name as "eraName",
      e.start_year as "eraStartYear", e.end_year as "eraEndYear", e.sort_order as "eraSortOrder",
      s.name, s.code, s.release_date::text as "releaseDate",
      coalesce(st.logo_url, s.logo_url) as "logoUrl",
      coalesce(st.symbol_url, s.symbol_url) as "symbolUrl",
      s.card_count_total as "cardCountTotal", s.card_count_official as "cardCountOfficial",
      s.languages::text[] as "languages",
      s.legal_standard as "legalStandard", s.legal_expanded as "legalExpanded",
      coalesce(st.name, s.name) as "localizedName",
      (
        select count(distinct ci.card_id)::int
        from collection_item ci join card c on c.id = ci.card_id
        where ci.user_id = ${userId} and c.set_id = any(${sql.param(memberIds)}::text[])
      ) as "ownedCount",
      (
        select sum(pr.market * ci.quantity)::text
        from collection_item ci
        join card c on c.id = ci.card_id
        left join lateral (
          select p.market, p.currency from card_price p
          where p.card_variant_id = ci.card_variant_id and p.currency = 'EUR' and p.market is not null
          limit 1
        ) pr on true
        where ci.user_id = ${userId} and c.set_id = any(${sql.param(memberIds)}::text[])
      ) as "ownedValueEur",
      (
        select sum(pr.market * ci.quantity)::text
        from collection_item ci
        join card c on c.id = ci.card_id
        left join lateral (
          select p.market, p.currency from card_price p
          where p.card_variant_id = ci.card_variant_id and p.currency = 'USD' and p.market is not null
          limit 1
        ) pr on true
        where ci.user_id = ${userId} and c.set_id = any(${sql.param(memberIds)}::text[])
      ) as "ownedValueUsd"
    from set s
    join series se on se.id = s.series_id
    join era e on e.id = se.era_id
    left join set_translation st on st.set_id = s.id and st.language = ${cardLanguage}
    where s.id = ${setId}
    limit 1
  `);

  const row = result.rows[0];
  if (!row) return null;

  /**
   * Subset totals fold into the parent's.
   *
   * The grid below now lists a Trainer Gallery's cards, so a header saying
   * 217 above a list of 247 would just look wrong.
   */
  if (memberIds.length > 1) {
    const extra = await db.execute<{ total: number; official: number }>(sql`
      select coalesce(sum(card_count_total), 0)::int as total,
             coalesce(sum(card_count_official), 0)::int as official
      from set where id = any(${sql.param(memberIds.slice(1))}::text[])
    `);
    const sums = extra.rows[0];
    if (sums) {
      row.cardCountTotal = Number(row.cardCountTotal) + Number(sums.total);
      row.cardCountOfficial = Number(row.cardCountOfficial) + Number(sums.official);
    }
  }

  return {
    id: row.id,
    seriesId: row.seriesId,
    seriesName: row.seriesName,
    eraId: row.eraId,
    name: row.name,
    localizedName: row.localizedName,
    code: row.code,
    releaseDate: row.releaseDate,
    logoUrl: row.logoUrl,
    symbolUrl: row.symbolUrl,
    cardCountTotal: Number(row.cardCountTotal),
    cardCountOfficial: Number(row.cardCountOfficial),
    languages: row.languages ?? [],
    ownedCount: Number(row.ownedCount),
    legalStandard: row.legalStandard,
    legalExpanded: row.legalExpanded,
    value: combineValue(row.ownedValueEur, row.ownedValueUsd, displayCurrency, rates),
  };
}

export interface CardTile {
  id: string;
  localId: string;
  name: string;
  /** True when no translation exists and we fell back to the English name. */
  nameFallback: boolean;
  imageBaseUrl: string | null;
  rarity: string | null;
  setId: string;
  setName: string;
  quantity: number;
  /** On this user's wishlist, in the language they are browsing. */
  wishlisted: boolean;
  defaultVariantId: string | null;
  defaultVariantType: VariantType | null;
  /** Every printing, so the grid can offer a choice when there is one. */
  variants: CardTileVariant[];
  price: Money | null;
  priceConfidence: PriceConfidence | null;
}

export interface CardTileVariant {
  id: string;
  variantType: VariantType;
  /**
   * `standard`, `jumbo`. Carried because 191 cards have two printings of the
   * same type that differ only by this, and a menu offering "Normal" twice
   * is worse than no menu.
   */
  size: string;
  price: Money | null;
}

export interface CardQuery {
  setId?: string;
  userId?: string | null;
  cardLanguage: CardLanguage;
  displayCurrency: Currency;
  ownership?: 'all' | 'owned' | 'missing';
  rarity?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sort?: 'number' | 'name' | 'price' | 'price-asc' | 'price-desc';
}

interface CardTileRow {
  id: string;
  localId: string;
  name: string;
  englishName: string;
  hasTranslation: boolean;
  imageBaseUrl: string | null;
  rarity: string | null;
  setId: string;
  setName: string;
  quantity: number;
  wishlisted: boolean;
  defaultVariantId: string | null;
  defaultVariantType: VariantType | null;
  variants: Array<{
    id: string;
    variantType: VariantType;
    size: string;
    market: string | null;
    currency: Currency | null;
  }> | null;
  priceMarket: string | null;
  priceCurrency: Currency | null;
  priceConfidence: PriceConfidence | null;
}

export async function listCards(query: CardQuery): Promise<{ cards: CardTile[]; total: number }> {
  const {
    setId,
    userId = null,
    cardLanguage,
    displayCurrency,
    ownership = 'all',
    rarity,
    search,
    limit = 60,
    offset = 0,
    sort = 'number',
  } = query;

  const rates = await getFxRates();

  const conditions = [sql`true`];
  if (setId) {
    // A Trainer Gallery is part of its set, so its cards belong in the same
    // grid rather than on a near-identically named page of their own.
    const ids = setIdWithSubsets(setId);
    conditions.push(
      ids.length === 1
        ? sql`c.set_id = ${setId}`
        : sql`c.set_id = any(${sql.param(ids)}::text[])`,
    );
  }
  if (rarity?.length) conditions.push(sql`c.rarity = any(${sql.param(rarity)}::text[])`);
  if (search) {
    const like = `%${search}%`;
    conditions.push(
      sql`(
        c.name ilike ${like}
        or ct.name ilike ${like}
        -- Match a printed name in any language: a French collector browsing
        -- an English set should still find "Dracaufeu".
        or exists (
          select 1 from card_translation tx
          where tx.card_id = c.id and tx.name ilike ${like}
        )
        -- Prefix, not equality, so "TG" finds TG01 through TG30 and "SWSH"
        -- finds the promo run. Equality meant a number was the only thing
        -- that ever matched, and only if typed in full.
        or c.local_id ilike ${`${search}%`}
        or c.rarity ilike ${like}
        or c.illustrator ilike ${like}
      )`,
    );
  }
  if (ownership === 'owned') {
    conditions.push(sql`exists (select 1 from collection_item ci where ci.user_id = ${userId} and ci.card_id = c.id)`);
  } else if (ownership === 'missing') {
    conditions.push(sql`not exists (select 1 from collection_item ci where ci.user_id = ${userId} and ci.card_id = c.id)`);
  }

  const where = sql.join(conditions, sql` and `);
  const orderBy =
    sort === 'name'
      ? sql`coalesce(ct.name, c.name) asc`
      : sort === 'price' || sort === 'price-desc'
        ? sql`pr.market desc nulls last`
        : sort === 'price-asc'
          ? sql`pr.market asc nulls last`
        : sql`c.sort_index asc, c.local_id asc`;

  const result = await db.execute<SqlRow<CardTileRow>>(sql`
    select
      c.id,
      coalesce(ct.local_id, c.local_id) as "localId",
      coalesce(ct.name, c.name)        as "name",
      c.name                           as "englishName",
      (ct.name is not null)            as "hasTranslation",
      coalesce(ct.image_base_url, c.image_base_url, c.fallback_image_url) as "imageBaseUrl",
      c.rarity,
      c.set_id as "setId",
      coalesce(st.name, s.name) as "setName",
      coalesce((
        select sum(ci.quantity)::int from collection_item ci
        where ci.user_id = ${userId} and ci.card_id = c.id
      ), 0) as "quantity",
      -- exists() rather than a join: a card has at most one wishlist row per
      -- language and we only need the yes/no, so this stops at the index.
      exists(
        select 1 from wishlist_item wi
        where wi.user_id = ${userId} and wi.card_id = c.id
      ) as "wishlisted",
      dv.id as "defaultVariantId",
      dv.variant_type as "defaultVariantType",
      /**
       * Every printing of this card, so a grid can offer the choice.
       *
       * 28% of cards exist as more than one printing - a reverse holo is a
       * different card to own and a different price - and adding the
       * default silently filed all of them as normal. The other 72% have
       * one printing and must stay a single tap, which is why this is a
       * list rather than a forced choice.
       */
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
      count(*) over () ::int as "total"
    from card c
    join set s on s.id = c.set_id
    left join set_translation st on st.set_id = s.id and st.language = ${cardLanguage}
    left join card_translation ct on ct.card_id = c.id and ct.language = ${cardLanguage}
    left join lateral (
      select v.id, v.variant_type from card_variant v
      where v.card_id = c.id
      order by v.is_default desc, v.variant_type
      limit 1
    ) dv on true
    left join lateral (
      select p.market, p.currency, p.confidence from card_price p
      where p.card_variant_id = dv.id and p.market is not null
      order by (p.confidence = 'exact') desc,
               array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'], p.provider) nulls last
      limit 1
    ) pr on true
    where ${where}
    order by ${orderBy}
    limit ${limit} offset ${offset}
  `);

  const total = result.rows.length > 0 ? Number((result.rows[0] as unknown as { total: number }).total) : 0;

  const cards = result.rows.map<CardTile>((row) => ({
    id: row.id,
    localId: row.localId,
    name: row.name,
    // A missing translation is the absence of a row, not a name that happens
    // to match English. Half the roster is spelled identically across
    // western languages - Pikachu is Pikachu in five of them - so comparing
    // strings flagged correctly translated cards as unverified.
    nameFallback: !row.hasTranslation && cardLanguage !== 'en',
    imageBaseUrl: row.imageBaseUrl,
    rarity: row.rarity,
    setId: row.setId,
    setName: row.setName,
    quantity: Number(row.quantity),
    wishlisted: Boolean(row.wishlisted),
    variants: (row.variants ?? []).map((variant) => ({
      id: variant.id,
      variantType: variant.variantType,
      size: variant.size,
      price:
        variant.market && variant.currency
          ? convertSimple(Number(variant.market), variant.currency, displayCurrency, rates)
          : null,
    })),
    defaultVariantId: row.defaultVariantId,
    defaultVariantType: row.defaultVariantType,
    price: row.priceMarket && row.priceCurrency
      ? convertSimple(Number(row.priceMarket), row.priceCurrency, displayCurrency, rates)
      : null,
    priceConfidence: row.priceConfidence,
  }));

  return { cards, total };
}

function convertSimple(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Record<string, number>,
): Money {
  if (from === to) return { minor: Math.round(amount * 100), currency: to };
  const rate = rates[`${from}:${to}`] ?? 1;
  return { minor: Math.round(amount * 100 * rate), currency: to };
}

export interface CardVariantDetail {
  id: string;
  variantType: VariantType;
  size: string;
  cardmarketProductId: number | null;
  tcgplayerProductId: number | null;
  prices: StoredPrice[];
  resolved: ReturnType<typeof pickPrice>;
}

export interface CardDetail {
  id: string;
  localId: string;
  name: string;
  englishName: string;
  hasTranslation: boolean;
  nameFallback: boolean;
  category: string;
  rarity: string | null;
  illustrator: string | null;
  hp: number | null;
  types: string[];
  stage: string | null;
  regulationMark: string | null;
  imageBaseUrl: string | null;
  extra: Record<string, unknown> | null;
  setId: string;
  setName: string;
  setCode: string | null;
  setLogoUrl: string | null;
  setCardCountTotal: number;
  seriesName: string;
  eraId: string;
  eraName: string;
  availableLanguages: CardLanguage[];
  variants: CardVariantDetail[];
  ownedEntries: Array<{
    id: string;
    variantId: string;
    variantType: VariantType;
    language: CardLanguage;
    condition: Condition;
    quantity: number;
    purchasePrice: string | null;
    purchaseCurrency: Currency | null;
    purchaseDate: string | null;
    notes: string | null;
  }>;
  wishlisted: boolean;
}

export async function getCardDetail(
  cardId: string,
  userId: string | null,
  cardLanguage: CardLanguage,
  displayCurrency: Currency,
): Promise<CardDetail | null> {
  const rates = await getFxRates();

  const base = await db.execute<{
    id: string;
    localId: string;
    name: string;
    englishName: string;
  hasTranslation: boolean;
    category: string;
    rarity: string | null;
    illustrator: string | null;
    hp: number | null;
    types: string[];
    stage: string | null;
    regulationMark: string | null;
    imageBaseUrl: string | null;
    extra: Record<string, unknown> | null;
    setId: string;
    setName: string;
    setCode: string | null;
    setLogoUrl: string | null;
    setCardCountTotal: number;
    seriesName: string;
    eraId: string;
    eraName: string;
    availableLanguages: CardLanguage[] | null;
  }>(sql`
    select
      c.id,
      coalesce(ct.local_id, c.local_id) as "localId",
      coalesce(ct.name, c.name) as "name",
      c.name as "englishName",
      (ct.name is not null) as "hasTranslation",
      c.category, c.rarity, c.illustrator, c.hp, c.types, c.stage,
      c.regulation_mark as "regulationMark",
      coalesce(ct.image_base_url, c.image_base_url, c.fallback_image_url) as "imageBaseUrl",
      c.extra,
      s.id as "setId",
      coalesce(st.name, s.name) as "setName",
      s.code as "setCode",
      coalesce(st.logo_url, s.logo_url) as "setLogoUrl",
      s.card_count_total as "setCardCountTotal",
      se.name as "seriesName",
      se.era_id as "eraId",
      e.name as "eraName",
      -- Translations hold only the non-canonical languages; the set's own
      -- origin language lives on the card row itself, so it has to be unioned
      -- back in or an English card never offers English as a choice.
      (
        select array_agg(distinct lang order by lang)
        from (
          select t.language::text as lang from card_translation t where t.card_id = c.id
          union
          select s.origin_language::text
        ) langs
      ) as "availableLanguages"
    from card c
    -- A Trainer Gallery card reports the set it was printed in, which is
    -- its parent: the subset no longer exists as a place you can go.
    left join (values ${sql.join(
      SUBSET_PAIRS.map((pair) => sql`(${pair[0]}, ${pair[1]})`),
      sql`, `,
    )}) as sub(child, parent) on sub.child = c.set_id
    join set s on s.id = coalesce(sub.parent, c.set_id)
    join series se on se.id = s.series_id
    join era e on e.id = se.era_id
    left join set_translation st on st.set_id = s.id and st.language = ${cardLanguage}
    left join card_translation ct on ct.card_id = c.id and ct.language = ${cardLanguage}
    where c.id = ${cardId}
    limit 1
  `);

  const row = base.rows[0];
  if (!row) return null;

  const variantRows = await db.execute<{
    id: string;
    variantType: VariantType;
    size: string;
    cardmarketProductId: number | null;
    tcgplayerProductId: number | null;
    prices: StoredPrice[] | null;
  }>(sql`
    select
      v.id, v.variant_type as "variantType", v.size,
      v.cardmarket_product_id as "cardmarketProductId",
      v.tcgplayer_product_id as "tcgplayerProductId",
      (
        select json_agg(json_build_object(
          'provider', p.provider, 'currency', p.currency, 'market', p.market,
          'low', p.low, 'mid', p.mid, 'high', p.high, 'trend', p.trend,
          'avg1', p.avg1, 'avg7', p.avg7, 'avg30', p.avg30,
          'confidence', p.confidence, 'approximationReason', p.approximation_reason,
          'sourceProductId', p.source_product_id, 'sourceUrl', p.source_url,
          'fetchedAt', p.fetched_at
        ))
        from card_price p where p.card_variant_id = v.id
      ) as prices
    from card_variant v
    where v.card_id = ${cardId}
    order by v.is_default desc, v.variant_type
  `);

  const ownedRows = userId
    ? await db.execute<CardDetail['ownedEntries'][number]>(sql`
        select ci.id, ci.card_variant_id as "variantId", v.variant_type as "variantType",
               ci.language, ci.condition, ci.quantity,
               ci.purchase_price::text as "purchasePrice",
               ci.purchase_currency as "purchaseCurrency",
               ci.purchase_date::text as "purchaseDate",
               ci.notes
        from collection_item ci
        join card_variant v on v.id = ci.card_variant_id
        where ci.user_id = ${userId} and ci.card_id = ${cardId}
        order by v.variant_type, ci.language, ci.condition
      `)
    : { rows: [] as CardDetail['ownedEntries'] };

  const wishlisted = userId
    ? (
        await db.execute<{ exists: boolean }>(
          sql`select exists(select 1 from wishlist_item where user_id = ${userId} and card_id = ${cardId}) as exists`,
        )
      ).rows[0]?.exists === true
    : false;

  return {
    ...row,
    types: row.types ?? [],
    // A missing translation is the absence of a row, not a name that happens
    // to match English. Half the roster is spelled identically across
    // western languages - Pikachu is Pikachu in five of them - so comparing
    // strings flagged correctly translated cards as unverified.
    nameFallback: !row.hasTranslation && cardLanguage !== 'en',
    availableLanguages: row.availableLanguages ?? ['en'],
    setCardCountTotal: Number(row.setCardCountTotal),
    variants: variantRows.rows.map((v) => {
      const prices = (v.prices ?? []).map((p) => ({ ...p, fetchedAt: new Date(p.fetchedAt) }));
      return {
        id: v.id,
        variantType: v.variantType,
        size: v.size,
        cardmarketProductId: v.cardmarketProductId,
        tcgplayerProductId: v.tcgplayerProductId,
        prices,
        resolved: pickPrice(prices, displayCurrency, rates),
      };
    }),
    ownedEntries: ownedRows.rows.map((entry) => ({ ...entry, quantity: Number(entry.quantity) })),
    wishlisted,
  };
}

/**
 * Most recently released sets, with the signed-in user's progress.
 *
 * Powers the home dashboard rail. Kept separate from `listSetsWithProgress` so
 * the dashboard costs one small query instead of loading 220 rows to show 8.
 */
export async function listRecentSets(
  userId: string | null,
  cardLanguage: CardLanguage,
  limit = 8,
): Promise<Array<Pick<SetNode, 'id' | 'name' | 'logoUrl' | 'releaseDate' | 'cardCountTotal' | 'ownedCount'>>> {
  const result = await db.execute<{
    id: string;
    name: string;
    logoUrl: string | null;
    releaseDate: string | null;
    cardCountTotal: number;
    ownedCount: number;
  }>(sql`
    select s.id,
           coalesce(st.name, s.name) as name,
           coalesce(st.logo_url, s.logo_url) as "logoUrl",
           s.release_date::text as "releaseDate",
           s.card_count_total as "cardCountTotal",
           coalesce((
             select count(distinct ci.card_id)::int
             from collection_item ci join card c on c.id = ci.card_id
             where ci.user_id = ${userId} and c.set_id = s.id
           ), 0) as "ownedCount"
    from set s
    left join set_translation st on st.set_id = s.id and st.language = ${cardLanguage}
    where s.release_date is not null and s.release_date <= current_date
      -- A Trainer Gallery shares its parent's release date and would show
      -- up beside it as a second "new set".
      and s.id <> all(${sql.param(SUBSET_IDS)}::text[])
    order by s.release_date desc
    limit ${limit}
  `);

  return result.rows.map((row) => ({
    ...row,
    cardCountTotal: Number(row.cardCountTotal),
    ownedCount: Number(row.ownedCount),
  }));
}

/** Sets the user has started, ordered by how close they are to finishing. */
export async function listSetsInProgress(
  userId: string,
  cardLanguage: CardLanguage,
  limit = 6,
): Promise<Array<Pick<SetNode, 'id' | 'name' | 'logoUrl' | 'cardCountTotal' | 'ownedCount'>>> {
  const result = await db.execute<{
    id: string;
    name: string;
    logoUrl: string | null;
    cardCountTotal: number;
    ownedCount: number;
  }>(sql`
    select s.id,
           coalesce(st.name, s.name) as name,
           coalesce(st.logo_url, s.logo_url) as "logoUrl",
           s.card_count_total as "cardCountTotal",
           count(distinct ci.card_id)::int as "ownedCount"
    from collection_item ci
    join card c on c.id = ci.card_id
    left join (values ${sql.join(
      SUBSET_PAIRS.map((pair) => sql`(${pair[0]}, ${pair[1]})`),
      sql`, `,
    )}) as sub(child, parent) on sub.child = c.set_id
    join set s on s.id = coalesce(sub.parent, c.set_id)
    left join set_translation st on st.set_id = s.id and st.language = ${cardLanguage}
    where ci.user_id = ${userId}
    group by s.id, st.name, st.logo_url
    having count(distinct ci.card_id) < s.card_count_total
    order by (count(distinct ci.card_id)::numeric / greatest(s.card_count_total, 1)) desc
    limit ${limit}
  `);

  return result.rows.map((row) => ({
    ...row,
    cardCountTotal: Number(row.cardCountTotal),
    ownedCount: Number(row.ownedCount),
  }));
}

/** True once the catalog import has run at least once. */
export async function isCatalogReady(): Promise<boolean> {
  const result = await db.execute<{ ready: boolean }>(
    sql`select exists(select 1 from set limit 1) as ready`,
  );
  return result.rows[0]?.ready === true;
}

/** Price history for one printing, oldest first. */
export async function getCardPriceHistory(
  variantId: string,
  days = 180,
): Promise<Array<{ date: string; market: number; currency: Currency; provider: string }>> {
  const result = await db.execute<{
    captured_on: string;
    market: string;
    currency: Currency;
    provider: string;
  }>(sql`
    select captured_on, market, currency, provider
    from card_price_snapshot
    where card_variant_id = ${variantId}
      and captured_on >= current_date - ${days}::int
      and market is not null
    order by captured_on asc
  `);
  return result.rows.map((row) => ({
    date: String(row.captured_on).slice(0, 10),
    market: Number(row.market),
    currency: row.currency,
    provider: row.provider,
  }));
}

export { valueStack };

/**
 * Rarities present in one set, for its filter menu.
 *
 * Read from the set's own cards so the menu never offers a rarity that would
 * return nothing - a generic list of every rarity in the game would be mostly
 * dead options on any given set.
 */
export async function listSetRarities(setId: string): Promise<string[]> {
  const result = await db.execute<SqlRow<{ rarity: string }>>(sql`
    select distinct rarity
    from card
    where set_id = ${setId} and rarity is not null and rarity <> ''
    order by rarity
  `);
  return result.rows.map((row) => row.rarity);
}
