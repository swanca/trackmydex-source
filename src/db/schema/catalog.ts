import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { cardLanguageEnum, variantTypeEnum } from './enums';

/**
 * Catalog layer.
 *
 * Canonical, provider-neutral card information lives here. Anything specific to
 * one upstream provider is confined to `externalId` / `providerRef` columns and
 * to the `card_variant.provider*` columns, so a second catalog provider can be
 * added without reshaping the model.
 *
 * Hierarchy: era -> series -> set -> card -> card_variant
 */

/**
 * An era groups series the way collectors talk about them ("the Wizards era",
 * "Scarlet & Violet"). Providers do not model this level, so it is ours and is
 * seeded from `src/lib/catalog/eras.ts`.
 */
export const era = pgTable('era', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  startYear: smallint('start_year').notNull(),
  endYear: smallint('end_year'),
  sortOrder: smallint('sort_order').notNull(),
});

export const series = pgTable(
  'series',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    eraId: varchar('era_id', { length: 32 })
      .notNull()
      .references(() => era.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    sortOrder: smallint('sort_order').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('series_era_idx').on(t.eraId, t.sortOrder)],
);

export const seriesTranslation = pgTable(
  'series_translation',
  {
    seriesId: varchar('series_id', { length: 64 })
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    language: cardLanguageEnum('language').notNull(),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.language] })],
);

export const set = pgTable(
  'set',
  {
    /** Provider-stable set identifier, e.g. `swsh3`, `base1`, `sv08.5`. */
    id: varchar('id', { length: 64 }).primaryKey(),
    seriesId: varchar('series_id', { length: 64 })
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Printed set code / abbreviation when the set has one (e.g. `DAA`). */
    code: varchar('code', { length: 16 }),
    releaseDate: date('release_date'),
    /** Cards printed in the numbered run. */
    cardCountOfficial: integer('card_count_official').notNull().default(0),
    /** Including secret rares and other cards past the printed total. */
    cardCountTotal: integer('card_count_total').notNull().default(0),
    cardCountHolo: integer('card_count_holo'),
    cardCountReverse: integer('card_count_reverse'),
    cardCountFirstEd: integer('card_count_first_ed'),
    logoUrl: text('logo_url'),
    symbolUrl: text('symbol_url'),
    legalStandard: boolean('legal_standard').notNull().default(false),
    legalExpanded: boolean('legal_expanded').notNull().default(false),
    /** Languages this set was actually printed in, discovered during sync. */
    languages: cardLanguageEnum('languages').array().notNull().default(sql`'{}'`),
    /**
     * The language this set is canonically *from*.
     *
     * Japanese, Korean and Chinese releases are their own sets with their own
     * ids, series and marketplace products - they are not translations of a
     * western set. Recording the origin is what lets the valuation layer say
     * that a Japanese card from a Japanese set is priced exactly, while a
     * Japanese card claimed against a western set is a substitution.
     */
    originLanguage: cardLanguageEnum('origin_language').notNull().default('en'),
    sortOrder: integer('sort_order').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('set_series_idx').on(t.seriesId, t.sortOrder),
    index('set_release_idx').on(t.releaseDate),
    index('set_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
);

export const setTranslation = pgTable(
  'set_translation',
  {
    setId: varchar('set_id', { length: 64 })
      .notNull()
      .references(() => set.id, { onDelete: 'cascade' }),
    language: cardLanguageEnum('language').notNull(),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),
    symbolUrl: text('symbol_url'),
    cardCountOfficial: integer('card_count_official'),
    cardCountTotal: integer('card_count_total'),
  },
  (t) => [
    primaryKey({ columns: [t.setId, t.language] }),
    index('set_translation_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
);

export const card = pgTable(
  'card',
  {
    /** Provider-stable card identifier, e.g. `swsh3-136`. */
    id: varchar('id', { length: 96 }).primaryKey(),
    setId: varchar('set_id', { length: 64 })
      .notNull()
      .references(() => set.id, { onDelete: 'cascade' }),
    /** Number as printed on the card. Text, because of `H1`, `SV12`, `TG05`, `?`. */
    localId: varchar('local_id', { length: 24 }).notNull(),
    /**
     * Numeric projection of `localId` used for stable ordering across mixed
     * numbering schemes. Cards whose number is not numeric sort after the rest.
     */
    sortIndex: numeric('sort_index', { precision: 10, scale: 3 }).notNull().default('0'),
    name: text('name').notNull(),
    category: varchar('category', { length: 24 }).notNull().default('Pokemon'),
    rarity: text('rarity'),
    illustrator: text('illustrator'),
    hp: integer('hp'),
    types: text('types').array().notNull().default(sql`'{}'`),
    stage: text('stage'),
    evolveFrom: text('evolve_from'),
    /** `D`, `E`, `F`, `G`, `H`... Modern-format legality marker. */
    regulationMark: varchar('regulation_mark', { length: 4 }),
    /** National Pokedex numbers depicted, for "all Pikachu cards" style search. */
    dexIds: integer('dex_ids').array().notNull().default(sql`'{}'`),
    /** Base asset URL; append `/high.png` or `/low.webp`. Never re-hosted by us. */
    imageBaseUrl: text('image_base_url'),

    /**
     * Artwork from a second source, used when the catalogue provider has none.
     *
     * TCGdex has no image for 10,089 of the 33,114 cards carried here. This
     * holds a complete URL rather than a base, because TCGplayer serves one
     * fixed size, and it lives in its own column so a later catalogue sync
     * that finally supplies real artwork does not have to know it happened.
     */
    fallbackImageUrl: text('fallback_image_url'),
    /** Full card payload from the provider, for fields the UI does not model yet. */
    extra: jsonb('extra'),
    /**
     * 128-bit perceptual fingerprint of the card artwork, as hex.
     *
     * Powers photo recognition. Stored as text rather than two bigints because
     * it is only ever compared as a whole, and hex keeps it readable in a
     * `psql` session when debugging a bad match.
     */
    imagePhash: varchar('image_phash', { length: 32 }),
    /** Which artwork URL produced the hash, so staleness is detectable. */
    imagePhashSource: text('image_phash_source'),
    /** Provider `updated` timestamp, used to skip unchanged cards on re-sync. */
    providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }),
    /** Content hash of the normalised payload; guards against silent drift. */
    contentHash: varchar('content_hash', { length: 64 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('card_set_local_idx').on(t.setId, t.localId),
    index('card_set_sort_idx').on(t.setId, t.sortIndex),
    index('card_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('card_rarity_idx').on(t.rarity),
    index('card_illustrator_idx').on(t.illustrator),
    index('card_dex_idx').using('gin', t.dexIds),
    // The scanner loads every fingerprint into memory once; this index makes
    // the "which cards still need hashing" backfill query cheap.
    index('card_phash_missing_idx')
      .on(t.id)
      .where(sql`${t.imagePhash} is null and ${t.imageBaseUrl} is not null`),
  ],
);

/**
 * Per-language printed information. A row exists only for languages the card was
 * actually released in, which is what makes "collect the Japanese print" a
 * first-class concept rather than a guess.
 */
export const cardTranslation = pgTable(
  'card_translation',
  {
    cardId: varchar('card_id', { length: 96 })
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    language: cardLanguageEnum('language').notNull(),
    name: text('name').notNull(),
    localId: varchar('local_id', { length: 24 }),
    imageBaseUrl: text('image_base_url'),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.language] }),
    index('card_translation_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('card_translation_lang_idx').on(t.language),
  ],
);

/**
 * A distinct printing of a card: normal, holo, reverse holo, 1st edition,
 * unlimited, staff promo... This is the unit a collection entry, a wishlist entry
 * and a price all point at, because valuing a reverse holo with a normal-print
 * price would be wrong by an order of magnitude on some cards.
 */
export const cardVariant = pgTable(
  'card_variant',
  {
    id: varchar('id', { length: 128 }).primaryKey(),
    cardId: varchar('card_id', { length: 96 })
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    variantType: variantTypeEnum('variant_type').notNull(),
    /** Provider's own variant id, kept for re-sync stability. */
    providerVariantId: varchar('provider_variant_id', { length: 64 }),
    /** `standard`, `jumbo`... affects which Cardmarket product applies. */
    size: varchar('size', { length: 24 }).notNull().default('standard'),
    /** Exact Cardmarket product id. Enables a real product link, not a search URL. */
    cardmarketProductId: integer('cardmarket_product_id'),
    tcgplayerProductId: integer('tcgplayer_product_id'),
    /** True when an admin pinned the market ids by hand; sync must not clobber it. */
    mappingLocked: boolean('mapping_locked').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('card_variant_card_idx').on(t.cardId),
    uniqueIndex('card_variant_card_type_size_idx').on(t.cardId, t.variantType, t.size),
    index('card_variant_cardmarket_idx').on(t.cardmarketProductId),
    index('card_variant_unmapped_idx')
      .on(t.cardId)
      .where(sql`${t.cardmarketProductId} is null`),
  ],
);

export const eraRelations = relations(era, ({ many }) => ({ series: many(series) }));

export const seriesRelations = relations(series, ({ one, many }) => ({
  era: one(era, { fields: [series.eraId], references: [era.id] }),
  sets: many(set),
  translations: many(seriesTranslation),
}));

export const setRelations = relations(set, ({ one, many }) => ({
  series: one(series, { fields: [set.seriesId], references: [series.id] }),
  cards: many(card),
  translations: many(setTranslation),
}));

export const cardRelations = relations(card, ({ one, many }) => ({
  set: one(set, { fields: [card.setId], references: [set.id] }),
  variants: many(cardVariant),
  translations: many(cardTranslation),
}));

export const cardVariantRelations = relations(cardVariant, ({ one }) => ({
  card: one(card, { fields: [cardVariant.cardId], references: [card.id] }),
}));
