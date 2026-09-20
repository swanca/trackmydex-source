import { sql } from 'drizzle-orm';
import { db, type SqlRow } from '@/db';
import type { CardLanguage, Condition, Currency, PriceConfidence } from '@/db/schema/enums';
import { addMoney, money, toMajor, toMinor, tryConvert, type Money } from '@/lib/pricing/money';
import { applySealedState, roundMoney } from '@/lib/pricing/condition';
import { valueStack, type StoredPrice } from '@/lib/pricing/select';
import { getFxRates } from './fx';

/**
 * Portfolio valuation.
 *
 * The heavy lifting - joining a user's rows to the right price - happens in one
 * SQL statement with a LATERAL that picks the preferred price per printing.
 * Valuation itself stays in TypeScript so the condition, language and currency
 * caveats are computed by the same tested code the card detail page uses, rather
 * than being re-implemented in SQL and drifting.
 */

export interface PortfolioRow {
  collectionItemId: string;
  cardId: string;
  cardName: string;
  localId: string;
  imageBaseUrl: string | null;
  setId: string;
  setName: string;
  setLogoUrl: string | null;
  setOriginLanguage: CardLanguage;
  setLanguages: CardLanguage[];
  seriesId: string;
  eraId: string;
  eraName: string;
  variantId: string;
  variantType: string;
  language: CardLanguage;
  condition: Condition;
  quantity: number;
  purchasePrice: string | null;
  purchaseCurrency: Currency | null;
  createdAt: Date;
  price: StoredPrice | null;
}

interface RawRow extends Omit<PortfolioRow, 'price'> {
  priceProvider: string | null;
  priceCurrency: Currency | null;
  priceMarket: string | null;
  priceLow: string | null;
  priceTrend: string | null;
  priceConfidence: PriceConfidence | null;
  priceReason: string | null;
  priceUrl: string | null;
  priceFetchedAt: Date | null;
}

const PRICE_LATERAL = sql`
  left join lateral (
    select p.provider, p.currency, p.market, p.low, p.trend,
           p.confidence, p.approximation_reason, p.source_url, p.fetched_at
    from card_price p
    where p.card_variant_id = cv.id
    order by (p.confidence = 'exact') desc,
             array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'], p.provider) nulls last
    limit 1
  ) price on true
`;

export async function getPortfolioRows(userId: string): Promise<PortfolioRow[]> {
  const result = await db.execute<SqlRow<RawRow>>(sql`
    select
      ci.id                as "collectionItemId",
      c.id                 as "cardId",
      c.name               as "cardName",
      c.local_id           as "localId",
      c.image_base_url     as "imageBaseUrl",
      s.id                 as "setId",
      s.name               as "setName",
      s.logo_url           as "setLogoUrl",
      s.origin_language    as "setOriginLanguage",
      s.languages::text[]  as "setLanguages",
      s.series_id          as "seriesId",
      se.era_id            as "eraId",
      e.name               as "eraName",
      cv.id                as "variantId",
      cv.variant_type      as "variantType",
      ci.language          as "language",
      ci.condition         as "condition",
      ci.quantity          as "quantity",
      ci.purchase_price    as "purchasePrice",
      ci.purchase_currency as "purchaseCurrency",
      ci.created_at        as "createdAt",
      price.provider             as "priceProvider",
      price.currency             as "priceCurrency",
      price.market               as "priceMarket",
      price.low                  as "priceLow",
      price.trend                as "priceTrend",
      price.confidence           as "priceConfidence",
      price.approximation_reason as "priceReason",
      price.source_url           as "priceUrl",
      price.fetched_at           as "priceFetchedAt"
    from collection_item ci
    join card_variant cv on cv.id = ci.card_variant_id
    join card c          on c.id = ci.card_id
    join set s           on s.id = c.set_id
    join series se       on se.id = s.series_id
    join era e           on e.id = se.era_id
    ${PRICE_LATERAL}
    where ci.user_id = ${userId}
  `);

  return result.rows.map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    setOriginLanguage: row.setOriginLanguage ?? 'en',
    setLanguages: row.setLanguages ?? [],
    price:
      row.priceProvider && row.priceCurrency
        ? {
            provider: row.priceProvider,
            currency: row.priceCurrency,
            market: row.priceMarket,
            low: row.priceLow,
            trend: row.priceTrend,
            confidence: row.priceConfidence ?? 'approximate',
            approximationReason: row.priceReason,
            sourceUrl: row.priceUrl,
            fetchedAt: row.priceFetchedAt ?? new Date(),
          }
        : null,
  }));
}

export interface SealedPortfolioRow {
  sealedItemId: string;
  sealedProductId: string;
  name: string;
  kind: string;
  groupName: string;
  language: CardLanguage;
  imageUrl: string | null;
  state: 'sealed' | 'opened' | 'damaged';
  quantity: number;
  purchasePrice: string | null;
  purchaseCurrency: Currency | null;
  createdAt: Date;
  priceMarket: string | null;
  priceCurrency: Currency | null;
}

/**
 * Sealed products a user owns, with the current market reading.
 *
 * Kept as its own query rather than union-ed into `getPortfolioRows` because the
 * two row shapes share almost no columns: a booster box has no set, era, rarity,
 * variant or printed-language dimension to bucket by.
 */
export async function getSealedPortfolioRows(userId: string): Promise<SealedPortfolioRow[]> {
  const result = await db.execute<SqlRow<SealedPortfolioRow>>(sql`
    select
      si.id                as "sealedItemId",
      si.sealed_product_id as "sealedProductId",
      p.name               as "name",
      p.kind               as "kind",
      p.source_group_name  as "groupName",
      p.language           as "language",
      p.image_url          as "imageUrl",
      si.state             as "state",
      si.quantity          as "quantity",
      si.purchase_price    as "purchasePrice",
      si.purchase_currency as "purchaseCurrency",
      si.created_at        as "createdAt",
      pr.market::text      as "priceMarket",
      pr.currency          as "priceCurrency"
    from sealed_item si
    join sealed_product p on p.id = si.sealed_product_id
    left join lateral (
      select market, currency from sealed_price
      where sealed_product_id = p.id and market is not null
      limit 1
    ) pr on true
    where si.user_id = ${userId}
  `);
  return result.rows.map((r) => ({ ...r, quantity: Number(r.quantity) }));
}

export interface Bucket {
  key: string;
  label: string;
  value: Money;
  count: number;
}

export interface PortfolioSummary {
  currency: Currency;
  totalValue: Money;
  /** Portion of the total backed by exact product matches. */
  exactValue: Money;
  totalSpend: Money;
  uniqueCards: number;
  totalCards: number;
  pricedCards: number;
  unpricedCards: number;
  setsStarted: number;
  /** Sealed products are counted in `totalValue` and broken out here too. */
  sealedValue: Money;
  sealedUnits: number;
  sealedUnique: number;
  byEra: Bucket[];
  byLanguage: Bucket[];
  bySet: Bucket[];
  topCards: Array<{
    cardId: string;
    variantId: string;
    name: string;
    localId: string;
    setName: string;
    setId: string;
    imageBaseUrl: string | null;
    language: CardLanguage;
    variantType: string;
    quantity: number;
    unit: Money;
    total: Money;
    confidence: PriceConfidence;
  }>;
  recentlyAdded: PortfolioSummary['topCards'];
  topSealed: Array<{
    sealedProductId: string;
    name: string;
    kind: string;
    groupName: string;
    imageUrl: string | null;
    state: string;
    quantity: number;
    unit: Money;
    total: Money;
  }>;
}

export async function getPortfolioSummary(
  userId: string,
  displayCurrency: Currency,
): Promise<PortfolioSummary> {
  const [rows, sealedRows, rates] = await Promise.all([
    getPortfolioRows(userId),
    getSealedPortfolioRows(userId),
    getFxRates(),
  ]);

  const zero = (): Money => ({ minor: 0, currency: displayCurrency });
  const summary: PortfolioSummary = {
    currency: displayCurrency,
    totalValue: zero(),
    exactValue: zero(),
    totalSpend: zero(),
    uniqueCards: 0,
    totalCards: 0,
    pricedCards: 0,
    unpricedCards: 0,
    setsStarted: 0,
    sealedValue: zero(),
    sealedUnits: 0,
    sealedUnique: 0,
    byEra: [],
    byLanguage: [],
    bySet: [],
    topCards: [],
    recentlyAdded: [],
    topSealed: [],
  };

  const eraBuckets = new Map<string, Bucket>();
  const languageBuckets = new Map<string, Bucket>();
  const setBuckets = new Map<string, Bucket>();
  const uniqueCardIds = new Set<string>();
  const setIds = new Set<string>();
  const valued: PortfolioSummary['topCards'] = [];

  for (const row of rows) {
    uniqueCardIds.add(row.cardId);
    setIds.add(row.setId);
    summary.totalCards += row.quantity;

    if (row.purchasePrice && row.purchaseCurrency) {
      const spend = money(Number(row.purchasePrice) * row.quantity, row.purchaseCurrency);
      const converted = tryConvert(spend, displayCurrency, rates);
      if (converted) summary.totalSpend = addMoney(summary.totalSpend, converted);
    }

    if (!row.price) {
      summary.unpricedCards += row.quantity;
      continue;
    }

    const valuation = valueStack(
      {
        prices: [row.price],
        quantity: row.quantity,
        condition: row.condition,
        language: row.language,
        setOriginLanguage: row.setOriginLanguage,
        setLanguages: row.setLanguages,
      },
      displayCurrency,
      rates,
    );

    if (valuation.total.minor === 0) {
      summary.unpricedCards += row.quantity;
      continue;
    }

    summary.pricedCards += row.quantity;
    summary.totalValue = addMoney(summary.totalValue, valuation.total);
    if (valuation.confidence === 'exact') {
      summary.exactValue = addMoney(summary.exactValue, valuation.total);
    }

    accumulate(eraBuckets, row.eraId, row.eraName, valuation.total, row.quantity);
    accumulate(languageBuckets, row.language, row.language, valuation.total, row.quantity);
    accumulate(setBuckets, row.setId, row.setName, valuation.total, row.quantity);

    valued.push({
      cardId: row.cardId,
      variantId: row.variantId,
      name: row.cardName,
      localId: row.localId,
      setName: row.setName,
      setId: row.setId,
      imageBaseUrl: row.imageBaseUrl,
      language: row.language,
      variantType: row.variantType,
      quantity: row.quantity,
      unit: valuation.unit,
      total: valuation.total,
      confidence: valuation.confidence,
    });
  }

  // Sealed products. Valued through the same money helpers so a USD-quoted box
  // and a EUR-quoted card land in the display currency the same way.
  const sealedValued: PortfolioSummary['topSealed'] = [];
  const sealedProductIds = new Set<string>();

  for (const row of sealedRows) {
    sealedProductIds.add(row.sealedProductId);
    summary.sealedUnits += row.quantity;

    if (row.purchasePrice && row.purchaseCurrency) {
      const spend = money(Number(row.purchasePrice) * row.quantity, row.purchaseCurrency);
      const converted = tryConvert(spend, displayCurrency, rates);
      if (converted) summary.totalSpend = addMoney(summary.totalSpend, converted);
    }

    if (!row.priceMarket || !row.priceCurrency) continue;

    const listed = money(Number(row.priceMarket), row.priceCurrency);
    const converted = tryConvert(listed, displayCurrency, rates);
    if (!converted) continue;

    // An opened box is not worth the sealed price. The adjustment is an explicit
    // documented multiplier, and the result is excluded from `exactValue`.
    const adjusted = applySealedState(converted.minor / 100, row.state);
    const unitMinor = toMinor(roundMoney(adjusted.amount));
    if (unitMinor === 0) continue;

    const unit: Money = { minor: unitMinor, currency: displayCurrency };
    const total: Money = { minor: unitMinor * row.quantity, currency: displayCurrency };

    summary.totalValue = addMoney(summary.totalValue, total);
    summary.sealedValue = addMoney(summary.sealedValue, total);
    if (!adjusted.adjusted) {
      summary.exactValue = addMoney(summary.exactValue, total);
    }

    sealedValued.push({
      sealedProductId: row.sealedProductId,
      name: row.name,
      kind: row.kind,
      groupName: row.groupName,
      imageUrl: row.imageUrl,
      state: row.state,
      quantity: row.quantity,
      unit,
      total,
    });
  }

  summary.sealedUnique = sealedProductIds.size;
  summary.topSealed = [...sealedValued].sort((a, b) => b.total.minor - a.total.minor).slice(0, 10);

  summary.uniqueCards = uniqueCardIds.size;
  summary.setsStarted = setIds.size;
  summary.byEra = sortBuckets(eraBuckets);
  summary.byLanguage = sortBuckets(languageBuckets);
  summary.bySet = sortBuckets(setBuckets).slice(0, 12);
  summary.topCards = [...valued].sort((a, b) => b.unit.minor - a.unit.minor).slice(0, 10);

  const byRecency = new Map(rows.map((r) => [r.variantId + r.language + r.condition, r.createdAt]));
  summary.recentlyAdded = [...valued]
    .sort((a, b) => {
      const aDate = byRecency.get(a.variantId + a.language) ?? new Date(0);
      const bDate = byRecency.get(b.variantId + b.language) ?? new Date(0);
      return bDate.getTime() - aDate.getTime();
    })
    .slice(0, 10);

  return summary;
}

function accumulate(
  map: Map<string, Bucket>,
  key: string,
  label: string,
  value: Money,
  count: number,
) {
  const existing = map.get(key);
  if (existing) {
    existing.value = addMoney(existing.value, value);
    existing.count += count;
  } else {
    map.set(key, { key, label, value: { ...value }, count });
  }
}

function sortBuckets(map: Map<string, Bucket>): Bucket[] {
  return [...map.values()].sort((a, b) => b.value.minor - a.value.minor);
}

/** Portfolio value history, newest last, for the dashboard chart. */
export async function getPortfolioHistory(
  userId: string,
  days = 90,
): Promise<Array<{ date: string; value: number; currency: Currency }>> {
  const result = await db.execute<{ captured_on: string; total_value: string; currency: Currency }>(sql`
    select captured_on, total_value, currency
    from portfolio_snapshot
    where user_id = ${userId}
      and captured_on >= current_date - ${days}::int
    order by captured_on asc
  `);
  return result.rows.map((row) => ({
    date: String(row.captured_on).slice(0, 10),
    value: Number(row.total_value),
    currency: row.currency,
  }));
}

/** Convenience used by the snapshot job. */
export function summaryToSnapshot(summary: PortfolioSummary) {
  return {
    currency: summary.currency,
    totalValue: String(toMajor(summary.totalValue.minor)),
    exactValue: String(toMajor(summary.exactValue.minor)),
    totalSpend: String(toMajor(summary.totalSpend.minor)),
    uniqueCards: summary.uniqueCards,
    totalCards: summary.totalCards,
  };
}
