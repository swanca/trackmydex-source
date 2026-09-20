import { relations } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { card, cardVariant } from './catalog';
import { currencyEnum, priceConfidenceEnum } from './enums';

/**
 * Pricing layer.
 *
 * `card_price` holds the current reading per (variant, provider). A page render
 * only ever reads this table - it never calls an upstream API - so browsing stays
 * fast and we stay well inside provider rate limits.
 *
 * Money is `numeric(12,2)` rather than a float: these values are summed across
 * thousands of rows to produce a portfolio total, and binary floats drift.
 */
export const cardPrice = pgTable(
  'card_price',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cardVariantId: varchar('card_variant_id', { length: 128 })
      .notNull()
      .references(() => cardVariant.id, { onDelete: 'cascade' }),
    /** Registered provider key, e.g. `tcgdex.cardmarket`, `tcgdex.tcgplayer`. */
    provider: varchar('provider', { length: 48 }).notNull(),
    currency: currencyEnum('currency').notNull(),

    /** Headline "current market value" for this provider. */
    market: numeric('market', { precision: 12, scale: 2 }),
    low: numeric('low', { precision: 12, scale: 2 }),
    mid: numeric('mid', { precision: 12, scale: 2 }),
    high: numeric('high', { precision: 12, scale: 2 }),
    trend: numeric('trend', { precision: 12, scale: 2 }),
    avg1: numeric('avg1', { precision: 12, scale: 2 }),
    avg7: numeric('avg7', { precision: 12, scale: 2 }),
    avg30: numeric('avg30', { precision: 12, scale: 2 }),
    directLow: numeric('direct_low', { precision: 12, scale: 2 }),

    confidence: priceConfidenceEnum('confidence').notNull().default('exact'),
    /**
     * Machine-readable reason a price is approximate, e.g.
     * `language-substitution:ja->en` or `variant-substitution:reverse->normal`.
     * Rendered as an explanation rather than hidden.
     */
    approximationReason: text('approximation_reason'),

    /** Provider-side product identifier the reading came from. */
    sourceProductId: varchar('source_product_id', { length: 64 }),
    sourceUrl: text('source_url'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('card_price_variant_provider_idx').on(t.cardVariantId, t.provider),
    index('card_price_fetched_idx').on(t.fetchedAt),
    index('card_price_market_idx').on(t.market),
  ],
);

/**
 * Daily history, written by the snapshot job.
 *
 * No free provider sells historical Pokemon TCG prices, so history is accumulated
 * by this application from the day it is deployed. The UI states this plainly
 * rather than rendering an empty chart as if data were missing.
 */
export const cardPriceSnapshot = pgTable(
  'card_price_snapshot',
  {
    cardVariantId: varchar('card_variant_id', { length: 128 })
      .notNull()
      .references(() => cardVariant.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 48 }).notNull(),
    capturedOn: date('captured_on').notNull(),
    currency: currencyEnum('currency').notNull(),
    market: numeric('market', { precision: 12, scale: 2 }),
    low: numeric('low', { precision: 12, scale: 2 }),
    trend: numeric('trend', { precision: 12, scale: 2 }),
  },
  (t) => [
    primaryKey({ columns: [t.cardVariantId, t.provider, t.capturedOn] }),
    index('card_price_snapshot_date_idx').on(t.capturedOn),
  ],
);

/**
 * Daily FX rates. Cardmarket is EUR and TCGplayer is USD, so any mixed portfolio
 * needs a rate. Stored rather than fetched per request, and shown to the user.
 */
export const fxRate = pgTable(
  'fx_rate',
  {
    base: varchar('base', { length: 3 }).notNull(),
    quote: varchar('quote', { length: 3 }).notNull(),
    asOf: date('as_of').notNull(),
    rate: numeric('rate', { precision: 14, scale: 6 }).notNull(),
    source: varchar('source', { length: 48 }).notNull().default('static'),
  },
  (t) => [primaryKey({ columns: [t.base, t.quote, t.asOf] })],
);

export const cardPriceRelations = relations(cardPrice, ({ one }) => ({
  variant: one(cardVariant, {
    fields: [cardPrice.cardVariantId],
    references: [cardVariant.id],
  }),
}));

/**
 * The one price we show for a card, precomputed.
 *
 * Sorting a catalogue by price cannot use an index when the price is
 * computed per row: picking the most valuable cards ran the provider-
 * preference lookup 33,807 times - once per card - touching 150,000 pages
 * and taking half a second before it could sort anything. No index helps,
 * because the value being ordered does not exist until the lateral runs.
 *
 * So it is materialised here, with exactly the same rule the card grid uses
 * to choose which reading to display: the default printing, preferring an
 * exact-confidence row, then the provider order. Keeping the rule identical
 * matters - a list ordered by one number and labelled with another is worse
 * than a slow list.
 *
 * Rebuilt by the price, sealed and catalogue syncs; see `refreshBestPrices`.
 * A stale row is harmless and self-corrects overnight, which is why this is
 * a plain table rather than anything transactional.
 */
export const cardBestPrice = pgTable(
  'card_best_price',
  {
    cardId: varchar('card_id', { length: 96 })
      .primaryKey()
      .references(() => card.id, { onDelete: 'cascade' }),
    cardVariantId: varchar('card_variant_id', { length: 128 }).notNull(),
    market: numeric('market', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The whole point: "most valuable first" becomes an index scan.
    index('card_best_price_market_idx').on(t.market.desc()),
  ],
);
