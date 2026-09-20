import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { set } from './catalog';
import { cardLanguageEnum, currencyEnum, sealedKindEnum, sealedStateEnum } from './enums';
import { user } from './auth';

/**
 * Sealed products: booster packs and boxes, Elite Trainer Boxes, bundles, tins,
 * blisters, theme decks, cases.
 *
 * These are a separate catalogue from cards, not a variant of one. A booster box
 * has no card number, no rarity, no printed language variants, and its price
 * moves on entirely different logic (print run, whether the set is still being
 * manufactured, speculation on chase cards inside). Modelling it as a `card` with
 * null columns everywhere would corrupt the card model to no benefit.
 *
 * The identifier is the TCGplayer product id prefixed with its source, so
 * re-syncing is idempotent and a second sealed provider can be added later
 * without an id collision.
 */
export const sealedProduct = pgTable(
  'sealed_product',
  {
    /** `tcgplayer:624679`. Prefixed so a second source cannot collide. */
    id: varchar('id', { length: 64 }).primaryKey(),
    sourceProductId: integer('source_product_id').notNull(),

    /**
     * The TCGplayer group this came from, kept verbatim.
     *
     * Sealed products are browsable by their own group even when we cannot match
     * that group to a set in our catalogue. Our sets come from TCGdex and the
     * two vocabularies do not align perfectly, so `setId` below is a bonus, not
     * a requirement - making it mandatory would silently drop products.
     */
    sourceGroupId: integer('source_group_id').notNull(),
    sourceGroupName: text('source_group_name').notNull(),

    /** Resolved against our catalogue by normalised name where possible. */
    setId: varchar('set_id', { length: 64 }).references(() => set.id, { onDelete: 'set null' }),

    name: text('name').notNull(),
    kind: sealedKindEnum('kind').notNull().default('other'),
    /** Language of the product itself: TCGplayer keeps Japan in its own category. */
    language: cardLanguageEnum('language').notNull().default('en'),

    imageUrl: text('image_url'),
    productUrl: text('product_url'),
    releasedOn: date('released_on'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sealed_product_source_idx').on(t.sourceProductId),
    index('sealed_product_group_idx').on(t.sourceGroupId),
    index('sealed_product_set_idx').on(t.setId),
    index('sealed_product_kind_idx').on(t.kind, t.language),
    index('sealed_product_released_idx').on(t.releasedOn.desc()),
  ],
);

/**
 * Current price per (product, provider).
 *
 * TCGplayer quotes USD and publishes no per-condition breakdown for sealed
 * products, so unlike `card_price` there is no condition dimension here. A box
 * is sealed or it is not, and the market prices it as one thing.
 */
export const sealedPrice = pgTable(
  'sealed_price',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    sealedProductId: varchar('sealed_product_id', { length: 64 })
      .notNull()
      .references(() => sealedProduct.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 48 }).notNull(),
    currency: currencyEnum('currency').notNull(),

    market: numeric('market', { precision: 12, scale: 2 }),
    low: numeric('low', { precision: 12, scale: 2 }),
    mid: numeric('mid', { precision: 12, scale: 2 }),
    high: numeric('high', { precision: 12, scale: 2 }),
    directLow: numeric('direct_low', { precision: 12, scale: 2 }),

    sourceUrl: text('source_url'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sealed_price_product_provider_idx').on(t.sealedProductId, t.provider),
    index('sealed_price_market_idx').on(t.market),
  ],
);

/** Daily history, written by the same snapshot job that handles cards. */
export const sealedPriceSnapshot = pgTable(
  'sealed_price_snapshot',
  {
    sealedProductId: varchar('sealed_product_id', { length: 64 })
      .notNull()
      .references(() => sealedProduct.id, { onDelete: 'cascade' }),
    capturedOn: date('captured_on').notNull(),
    provider: varchar('provider', { length: 48 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    market: numeric('market', { precision: 12, scale: 2 }),
  },
  (t) => [
    primaryKey({ columns: [t.sealedProductId, t.capturedOn, t.provider] }),
    index('sealed_price_snapshot_day_idx').on(t.capturedOn),
  ],
);

/**
 * Sealed product owned by a user.
 *
 * Deliberately a separate table from `collection_item` rather than making that
 * table's `card_variant_id` nullable. That column is NOT NULL and every
 * collection query joins through it; widening it would weaken the guarantee on
 * the hot path to accommodate a row shape that shares none of its columns. The
 * two are unioned where a total is needed.
 *
 * `state` exists because an opened Elite Trainer Box is worth a fraction of a
 * sealed one, and a collector who tracks both needs them apart.
 */
export const sealedItem = pgTable(
  'sealed_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sealedProductId: varchar('sealed_product_id', { length: 64 })
      .notNull()
      .references(() => sealedProduct.id, { onDelete: 'cascade' }),
    state: sealedStateEnum('state').notNull().default('sealed'),
    quantity: integer('quantity').notNull().default(1),

    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }),
    purchaseCurrency: currencyEnum('purchase_currency'),
    purchaseDate: date('purchase_date'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sealed_item_stack_idx').on(t.userId, t.sealedProductId, t.state),
    index('sealed_item_user_recent_idx').on(t.userId, t.createdAt.desc()),
    index('sealed_item_product_idx').on(t.sealedProductId),
    check('sealed_item_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'sealed_item_purchase_price_non_negative',
      sql`${t.purchasePrice} is null or ${t.purchasePrice} >= 0`,
    ),
    check(
      'sealed_item_purchase_currency_paired',
      sql`(${t.purchasePrice} is null) = (${t.purchaseCurrency} is null)`,
    ),
  ],
);

export const sealedProductRelations = relations(sealedProduct, ({ one, many }) => ({
  set: one(set, { fields: [sealedProduct.setId], references: [set.id] }),
  prices: many(sealedPrice),
}));

export const sealedPriceRelations = relations(sealedPrice, ({ one }) => ({
  product: one(sealedProduct, {
    fields: [sealedPrice.sealedProductId],
    references: [sealedProduct.id],
  }),
}));

export const sealedItemRelations = relations(sealedItem, ({ one }) => ({
  user: one(user, { fields: [sealedItem.userId], references: [user.id] }),
  product: one(sealedProduct, {
    fields: [sealedItem.sealedProductId],
    references: [sealedProduct.id],
  }),
}));
