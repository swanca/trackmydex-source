import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { env } from '@/lib/env';
import { db } from '@/db';
import {
  cardPrice,
  cardPriceSnapshot,
  cardVariant,
  collectionItem,
  set as setTable,
  card as cardTable,
  wishlistItem,
} from '@/db/schema';
import { logger } from '@/lib/logger';
import { getEnabledPricingProviders, getPayloadSource } from '@/providers/pricing';
import type { PriceQuote, PriceableVariant } from '@/providers/pricing/types';
import type { ProviderCard } from '@/providers/catalog/types';
import { variantId } from './catalog';
import type { SyncContext } from './run';

/**
 * Price ingestion.
 *
 * Two paths:
 *  - `upsertPricesFromCatalog` runs during a catalog sync and costs nothing
 *    extra, because TCGdex embeds prices in the card document we already
 *    downloaded.
 *  - `syncPrices` is the standalone refresh, and it covers the whole catalog.
 */

const CHUNK = 500;

function chunk<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toRow(variantIdValue: string, quote: PriceQuote) {
  return {
    cardVariantId: variantIdValue,
    provider: quote.provider,
    currency: quote.currency,
    market: quote.market === null ? null : String(quote.market),
    low: quote.low == null ? null : String(quote.low),
    mid: quote.mid == null ? null : String(quote.mid),
    high: quote.high == null ? null : String(quote.high),
    trend: quote.trend == null ? null : String(quote.trend),
    avg1: quote.avg1 == null ? null : String(quote.avg1),
    avg7: quote.avg7 == null ? null : String(quote.avg7),
    avg30: quote.avg30 == null ? null : String(quote.avg30),
    directLow: quote.directLow == null ? null : String(quote.directLow),
    confidence: quote.confidence,
    approximationReason: quote.approximationReason ?? null,
    sourceProductId: quote.sourceProductId ?? null,
    sourceUrl: quote.sourceUrl ?? null,
    fetchedAt: quote.fetchedAt,
  };
}

async function writePriceRows(rows: ReturnType<typeof toRow>[]): Promise<number> {
  let written = 0;
  for (const batch of chunk(rows)) {
    if (batch.length === 0) continue;
    await db
      .insert(cardPrice)
      .values(batch)
      .onConflictDoUpdate({
        target: [cardPrice.cardVariantId, cardPrice.provider],
        set: {
          currency: sql`excluded.currency`,
          market: sql`excluded.market`,
          low: sql`excluded.low`,
          mid: sql`excluded.mid`,
          high: sql`excluded.high`,
          trend: sql`excluded.trend`,
          avg1: sql`excluded.avg1`,
          avg7: sql`excluded.avg7`,
          avg30: sql`excluded.avg30`,
          directLow: sql`excluded.direct_low`,
          confidence: sql`excluded.confidence`,
          approximationReason: sql`excluded.approximation_reason`,
          sourceProductId: sql`excluded.source_product_id`,
          sourceUrl: sql`excluded.source_url`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
    written += batch.length;
  }
  return written;
}

/** Derives prices from card payloads the catalog sync already has in memory. */
export async function upsertPricesFromCatalog(cards: readonly ProviderCard[]): Promise<number> {
  const providers = getEnabledPricingProviders();
  if (providers.length === 0) return 0;

  const rows: ReturnType<typeof toRow>[] = [];

  for (const c of cards) {
    for (const variant of c.variants) {
      if (variant.rawPricing == null) continue;
      const id = variantId(c.id, variant.type, variant.size);
      const priceable: PriceableVariant = {
        variantId: id,
        cardId: c.id,
        variantType: variant.type,
        size: variant.size,
        cardmarketProductId: variant.cardmarketProductId ?? null,
        tcgplayerProductId: variant.tcgplayerProductId ?? null,
      };
      for (const provider of providers) {
        for (const quote of provider.fromCatalogPayload(priceable, variant.rawPricing)) {
          rows.push(toRow(id, quote));
        }
      }
    }
  }

  return writePriceRows(rows);
}

export interface PriceSyncOptions {
  /**
   * Hard cap on printings refreshed in one run.
   *
   * Defaults to the whole catalog. Set PRICE_SYNC_MAX_VARIANTS to a positive
   * number only if a run has to fit inside a shorter window; the prioritised
   * ordering below means a capped run still covers what users look at first.
   */
  limit?: number;
  /** Restrict to one set, used by the admin "refresh this set" action. */
  setId?: string;
  /** Skip the ownership priority and refresh purely by staleness. */
  stalestFirst?: boolean;
}

/** Cards fetched per batch before prices are written and memory is released. */
const PRICE_BATCH_CARDS = 400;

/**
 * Refreshes prices for the entire catalog.
 *
 * Every printing gets a price, because a tracker that only prices what you
 * already own cannot tell you what the cards you are missing would cost - and
 * that is half the reason to keep a wishlist. A full pass is roughly 24,000
 * requests (one per card, shared across every provider reading the same
 * upstream document), which at the default concurrency takes 20-40 minutes and
 * is comfortably a nightly job.
 *
 * Ordering still matters even though everything is covered, because a run can
 * be interrupted, rate-limited or deliberately capped:
 *
 *  1. printings at least one user owns or has wishlisted;
 *  2. printings from the most recently released sets, where prices move fastest;
 *  3. everything else, stalest first.
 *
 * Work is committed batch by batch, so an interrupted run keeps every price it
 * already fetched instead of losing the lot.
 */
export async function syncPrices(ctx: SyncContext, options: PriceSyncOptions = {}) {
  const providers = getEnabledPricingProviders();
  if (providers.length === 0) {
    await ctx.fail('provider', null, 'No pricing provider is enabled');
    return ctx.stats;
  }

  const configuredCap = Number(process.env.PRICE_SYNC_MAX_VARIANTS ?? 0);
  const limit = options.limit ?? (configuredCap > 0 ? configuredCap : Number.POSITIVE_INFINITY);

  const targets = await selectTargets(limit, options);
  ctx.bump('targets', targets.length);
  if (targets.length === 0) return ctx.stats;

  // Providers reading the same upstream card document share a single fetch.
  const shared = new Map<string, typeof providers>();
  const standalone: typeof providers = [];
  for (const provider of providers) {
    if (provider.payloadSource && getPayloadSource(provider.payloadSource)) {
      const group = shared.get(provider.payloadSource) ?? [];
      group.push(provider);
      shared.set(provider.payloadSource, group);
    } else {
      standalone.push(provider);
    }
  }

  const byCard = groupByCard(targets);
  const cardIds = [...byCard.keys()];
  ctx.bump('cards', cardIds.length);

  for (const [sourceKey, group] of shared) {
    const source = getPayloadSource(sourceKey);
    if (!source) continue;

    for (let offset = 0; offset < cardIds.length; offset += PRICE_BATCH_CARDS) {
      const batch = cardIds.slice(offset, offset + PRICE_BATCH_CARDS);
      try {
        const payloads = await source.fetch(batch);
        const rows: ReturnType<typeof toRow>[] = [];

        for (const cardId of batch) {
          const payload = payloads.get(cardId);
          if (!payload) continue;
          for (const variant of byCard.get(cardId) ?? []) {
            const block = source.blockFor(payload, variant);
            for (const provider of group) {
              for (const quote of provider.fromCatalogPayload(variant, block)) {
                rows.push(toRow(variant.variantId, quote));
              }
            }
          }
        }

        ctx.bump(`prices.${sourceKey}`, await writePriceRows(rows));
        ctx.bump('cardsProcessed', batch.length);
      } catch (error) {
        // One bad batch must not abandon the other 23,600 cards.
        await ctx.fail('price', `${sourceKey}:${offset}`, 'Price batch failed', error);
      }
    }
  }

  for (const provider of standalone) {
    for (let offset = 0; offset < targets.length; offset += PRICE_BATCH_CARDS) {
      const batch = targets.slice(offset, offset + PRICE_BATCH_CARDS);
      try {
        const quotes = await provider.fetchQuotes(batch);
        const rows: ReturnType<typeof toRow>[] = [];
        for (const [id, list] of quotes) {
          for (const quote of list) rows.push(toRow(id, quote));
        }
        ctx.bump(`prices.${provider.key}`, await writePriceRows(rows));
      } catch (error) {
        await ctx.fail('price', provider.key, 'Provider refresh failed', error);
      }
    }
  }

  return ctx.stats;
}

function groupByCard(variants: readonly PriceableVariant[]): Map<string, PriceableVariant[]> {
  const byCard = new Map<string, PriceableVariant[]>();
  for (const variant of variants) {
    const list = byCard.get(variant.cardId) ?? [];
    list.push(variant);
    byCard.set(variant.cardId, list);
  }
  return byCard;
}

async function selectTargets(
  limit: number,
  options: PriceSyncOptions,
): Promise<PriceableVariant[]> {
  const select = {
    variantId: cardVariant.id,
    cardId: cardVariant.cardId,
    variantType: cardVariant.variantType,
    size: cardVariant.size,
    cardmarketProductId: cardVariant.cardmarketProductId,
    tcgplayerProductId: cardVariant.tcgplayerProductId,
  };

  if (options.setId) {
    return db
      .select(select)
      .from(cardVariant)
      .innerJoin(cardTable, eq(cardTable.id, cardVariant.cardId))
      .where(eq(cardTable.setId, options.setId));
  }

  const capped = Number.isFinite(limit);
  const seen = new Set<string>();
  const out: PriceableVariant[] = [];

  const push = (rows: PriceableVariant[]) => {
    for (const row of rows) {
      if (capped && out.length >= limit) return;
      if (seen.has(row.variantId)) continue;
      seen.add(row.variantId);
      out.push(row);
    }
  };

  if (!options.stalestFirst) {
    // 1. Owned or wanted.
    push(
      await db
        .selectDistinct(select)
        .from(cardVariant)
        .where(
          or(
            sql`exists (select 1 from ${collectionItem} ci where ci.card_variant_id = ${cardVariant.id})`,
            sql`exists (select 1 from ${wishlistItem} wi where wi.card_variant_id = ${cardVariant.id})`,
          ),
        ),
    );

    // 2. Newest sets first: where prices actually move.
    if (!capped || out.length < limit) {
      push(
        await db
          .select(select)
          .from(cardVariant)
          .innerJoin(cardTable, eq(cardTable.id, cardVariant.cardId))
          .innerJoin(setTable, eq(setTable.id, cardTable.setId))
          .where(isNotNull(setTable.releaseDate))
          .orderBy(desc(setTable.releaseDate), cardTable.sortIndex),
      );
    }
  }

  // 3. Everything else, stalest first. This pass is what makes coverage
  //    complete: sets with no release date, and cards nobody owns, are still
  //    priced.
  if (!capped || out.length < limit) {
    push(
      await db
        .select(select)
        .from(cardVariant)
        .leftJoin(
          cardPrice,
          and(
            eq(cardPrice.cardVariantId, cardVariant.id),
            eq(cardPrice.provider, 'tcgdex.cardmarket'),
          ),
        )
        .orderBy(sql`${cardPrice.fetchedAt} asc nulls first`),
    );
  }

  logger.debug('price sync targets selected', {
    count: out.length,
    cap: capped ? limit : 'uncapped',
  });
  return out;
}

/**
 * Daily price history.
 *
 * Copies today's readings into `card_price_snapshot`. Re-running on the same day
 * overwrites rather than duplicating, so an operator can safely retry a failed
 * nightly job.
 */
export async function snapshotPrices(ctx: SyncContext): Promise<number> {
  // Scope decides how fast this table grows. At `all` it is every priced
  // printing, every day: 64,000 rows and ~18 MB daily, which fills any free
  // Postgres tier inside a month and reaches 7 GB in a year. At `tracked` it is
  // only what someone owns or wants, which on a personal instance is a rounding
  // error by comparison.
  const scope =
    env.PRICE_HISTORY_SCOPE === 'all'
      ? sql`true`
      : sql`p.card_variant_id in (
              select card_variant_id from collection_item
              union
              select card_variant_id from wishlist_item
            )`;

  const result = await db.execute(sql`
    insert into card_price_snapshot (card_variant_id, provider, captured_on, currency, market, low, trend)
    select p.card_variant_id, p.provider, current_date, p.currency, p.market, p.low, p.trend
    from card_price p
    where p.market is not null and ${scope}
    on conflict (card_variant_id, provider, captured_on) do update
      set currency = excluded.currency,
          market   = excluded.market,
          low      = excluded.low,
          trend    = excluded.trend
  `);
  const count = result.rowCount ?? 0;
  ctx.bump('priceSnapshots', count);
  return count;
}

/**
 * Keep price history from growing without bound.
 *
 * Two passes, in order:
 *
 *  1. Thin. Past PRICE_HISTORY_DAILY_DAYS, everything but the Monday reading of
 *     each week is deleted. Scoping to tracked printings slows growth but never
 *     stops it - a row per owned card per day is still half a gigabyte a year
 *     on a 5,000-card collection - and nobody reads a three-year-old chart at
 *     day resolution. Weekly points draw the same line.
 *
 *  2. Delete. Anything past PRICE_HISTORY_RETENTION_DAYS goes entirely. Off by
 *     default, because with thinning in place the table grows slowly enough
 *     that discarding a collector's own history is the greater loss.
 *
 * Both are plain deletes on an indexed date column, and both are idempotent:
 * a day the job runs twice, or a day it does not run at all, changes nothing.
 */
export async function compactSnapshots(ctx: SyncContext): Promise<number> {
  let removed = 0;

  const dailyDays = env.PRICE_HISTORY_DAILY_DAYS;
  if (dailyDays > 0) {
    // isodow 1 is Monday. Keeping one fixed weekday leaves an evenly spaced
    // series rather than whichever days happened to survive.
    for (const table of ['card_price_snapshot', 'sealed_price_snapshot']) {
      const result = await db.execute(sql`
        delete from ${sql.identifier(table)}
        where captured_on < current_date - ${dailyDays}::int
          and extract(isodow from captured_on) <> 1
      `);
      removed += result.rowCount ?? 0;
    }
    if (removed > 0) ctx.bump('snapshotsThinned', removed);
  }

  const keepDays = env.PRICE_HISTORY_RETENTION_DAYS;
  if (keepDays > 0) {
    let deleted = 0;
    for (const table of ['card_price_snapshot', 'sealed_price_snapshot']) {
      const result = await db.execute(sql`
        delete from ${sql.identifier(table)}
        where captured_on < current_date - ${keepDays}::int
      `);
      deleted += result.rowCount ?? 0;
    }
    if (deleted > 0) ctx.bump('snapshotsExpired', deleted);
    removed += deleted;
  }

  return removed;
}

/** Number of distinct priced printings, used by the admin dashboard. */
export async function countPricedVariants(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(distinct ${cardPrice.cardVariantId})::int` })
    .from(cardPrice);
  return rows[0]?.count ?? 0;
}

export { cardPriceSnapshot };
