import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { card, cardVariant } from './catalog';
import { cardLanguageEnum, conditionEnum, currencyEnum } from './enums';
import { user } from './auth';

/**
 * A stack of identical copies: same printing, same printed language, same
 * condition. Quantity is incremented rather than inserting a row per copy, which
 * is what makes one-tap +/- fast and keeps the table at a sane size for users who
 * own thousands of cards.
 *
 * `cardId` is denormalised alongside `cardVariantId` so the hot "do I own this
 * card at all" query on a 250-card set page is a single index scan.
 */
export const collectionItem = pgTable(
  'collection_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cardId: varchar('card_id', { length: 96 })
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    cardVariantId: varchar('card_variant_id', { length: 128 })
      .notNull()
      .references(() => cardVariant.id, { onDelete: 'cascade' }),
    language: cardLanguageEnum('language').notNull(),
    condition: conditionEnum('condition').notNull().default('near_mint'),
    quantity: integer('quantity').notNull().default(1),

    /** Unit price paid, optional. Drives realised gain/loss on the dashboard. */
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }),
    purchaseCurrency: currencyEnum('purchase_currency'),
    purchaseDate: date('purchase_date'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collection_item_stack_idx').on(
      t.userId,
      t.cardVariantId,
      t.language,
      t.condition,
    ),
    index('collection_item_user_card_idx').on(t.userId, t.cardId),
    index('collection_item_user_recent_idx').on(t.userId, t.createdAt.desc()),
    index('collection_item_variant_idx').on(t.cardVariantId),
    check('collection_item_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'collection_item_purchase_price_non_negative',
      sql`${t.purchasePrice} is null or ${t.purchasePrice} >= 0`,
    ),
    check(
      'collection_item_purchase_currency_paired',
      sql`(${t.purchasePrice} is null) = (${t.purchaseCurrency} is null)`,
    ),
  ],
);

export const wishlistItem = pgTable(
  'wishlist_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    cardId: varchar('card_id', { length: 96 })
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    cardVariantId: varchar('card_variant_id', { length: 128 })
      .notNull()
      .references(() => cardVariant.id, { onDelete: 'cascade' }),
    /** Desired printed language. */
    language: cardLanguageEnum('language').notNull(),
    /** Alert threshold: the UI highlights the row once market drops below it. */
    targetPrice: numeric('target_price', { precision: 12, scale: 2 }),
    targetCurrency: currencyEnum('target_currency'),
    /** 1 = highest. Keeps the list actionable rather than a dumping ground. */
    priority: smallint('priority').notNull().default(3),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wishlist_item_unique_idx').on(t.userId, t.cardVariantId, t.language),
    index('wishlist_item_user_idx').on(t.userId, t.priority),
    check('wishlist_priority_range', sql`${t.priority} between 1 and 5`),
    check(
      'wishlist_target_currency_paired',
      sql`(${t.targetPrice} is null) = (${t.targetCurrency} is null)`,
    ),
  ],
);

/**
 * One row per user per day, written by the snapshot job. This is what makes
 * "collection value over time" possible without a historical price API.
 */
export const portfolioSnapshot = pgTable(
  'portfolio_snapshot',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    capturedOn: date('captured_on').notNull(),
    currency: currencyEnum('currency').notNull(),
    totalValue: numeric('total_value', { precision: 14, scale: 2 }).notNull(),
    /** Value attributable to rows priced exactly, for an honest confidence split. */
    exactValue: numeric('exact_value', { precision: 14, scale: 2 }).notNull().default('0'),
    totalSpend: numeric('total_spend', { precision: 14, scale: 2 }).notNull().default('0'),
    uniqueCards: integer('unique_cards').notNull().default(0),
    totalCards: integer('total_cards').notNull().default(0),
  },
  (t) => [
    uniqueIndex('portfolio_snapshot_pk').on(t.userId, t.capturedOn),
    index('portfolio_snapshot_user_idx').on(t.userId, t.capturedOn.desc()),
  ],
);

export const collectionItemRelations = relations(collectionItem, ({ one }) => ({
  user: one(user, { fields: [collectionItem.userId], references: [user.id] }),
  card: one(card, { fields: [collectionItem.cardId], references: [card.id] }),
  variant: one(cardVariant, {
    fields: [collectionItem.cardVariantId],
    references: [cardVariant.id],
  }),
}));

export const wishlistItemRelations = relations(wishlistItem, ({ one }) => ({
  card: one(card, { fields: [wishlistItem.cardId], references: [card.id] }),
  variant: one(cardVariant, {
    fields: [wishlistItem.cardVariantId],
    references: [cardVariant.id],
  }),
}));
