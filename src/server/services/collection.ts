import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, type SqlRow } from '@/db';
import { card, cardVariant, collectionItem, wishlistItem } from '@/db/schema';
import { CARD_LANGUAGES, CONDITIONS, CURRENCIES } from '@/db/schema/enums';
import { logger } from '@/lib/logger';

/**
 * Collection mutations.
 *
 * Every function takes `userId` as its first argument and scopes every statement
 * by it. There is no code path that accepts a user id from the client, so a
 * forged request cannot reach another account's rows - and the unique index on
 * (user, variant, language, condition) means a double-tapped "+" button cannot
 * create two stacks of the same thing.
 */

export const collectionEntrySchema = z.object({
  cardVariantId: z.string().min(1).max(128),
  language: z.enum(CARD_LANGUAGES),
  condition: z.enum(CONDITIONS).default('near_mint'),
  quantity: z.number().int().min(0).max(9_999),
  purchasePrice: z.number().min(0).max(1_000_000).nullish(),
  purchaseCurrency: z.enum(CURRENCIES).nullish(),
  purchaseDate: z.iso.date().nullish(),
  notes: z.string().max(1_000).nullish(),
});

export type CollectionEntryInput = z.infer<typeof collectionEntrySchema>;

export const quantityDeltaSchema = z.object({
  cardVariantId: z.string().min(1).max(128),
  language: z.enum(CARD_LANGUAGES),
  condition: z.enum(CONDITIONS).default('near_mint'),
  delta: z.number().int().min(-99).max(99),
});

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

async function resolveCardId(cardVariantId: string): Promise<string> {
  const rows = await db
    .select({ cardId: cardVariant.cardId })
    .from(cardVariant)
    .where(eq(cardVariant.id, cardVariantId))
    .limit(1);
  const cardId = rows[0]?.cardId;
  if (!cardId) throw new NotFoundError('Printing');
  return cardId;
}

export interface QuantityResult {
  /** Copies in the stack that was touched: this variant, language, condition. */
  quantity: number;
  /**
   * Copies of the card across every stack.
   *
   * A grid tile counts a card, not a printing - somebody with a French and an
   * English copy owns two. Returning only the stack made the tile fall from
   * "3" to "1" the first time a second language was touched, because the
   * number on screen and the number coming back were counting different
   * things.
   */
  cardTotal: number;
  cardId: string;
  removed: boolean;
}

/** Every copy of a card the user holds, whatever the printing or condition. */
async function getCardTotal(userId: string, cardId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${collectionItem.quantity}), 0)::int` })
    .from(collectionItem)
    .where(and(eq(collectionItem.userId, userId), eq(collectionItem.cardId, cardId)));
  return row?.total ?? 0;
}

/**
 * One-tap increment / decrement.
 *
 * Implemented as a single upsert so two rapid taps cannot race into two rows,
 * and so the round trip stays short enough for the optimistic UI to feel instant.
 * Reaching zero deletes the row rather than keeping a zero-quantity ghost that
 * would pollute "cards owned" counts.
 */
export async function adjustQuantity(
  userId: string,
  input: z.infer<typeof quantityDeltaSchema>,
): Promise<QuantityResult> {
  const { cardVariantId, language, condition, delta } = quantityDeltaSchema.parse(input);
  const cardId = await resolveCardId(cardVariantId);

  if (delta === 0) {
    const current = await getStackQuantity(userId, cardVariantId, language, condition);
    return { quantity: current, cardTotal: await getCardTotal(userId, cardId), cardId, removed: false };
  }

  if (delta > 0) {
    const [row] = await db
      .insert(collectionItem)
      .values({ userId, cardId, cardVariantId, language, condition, quantity: delta })
      .onConflictDoUpdate({
        target: [
          collectionItem.userId,
          collectionItem.cardVariantId,
          collectionItem.language,
          collectionItem.condition,
        ],
        set: {
          quantity: sql`least(${collectionItem.quantity} + ${delta}, 9999)`,
          updatedAt: new Date(),
        },
      })
      .returning({ quantity: collectionItem.quantity });
    return {
      quantity: row?.quantity ?? delta,
      cardTotal: await getCardTotal(userId, cardId),
      cardId,
      removed: false,
    };
  }

  const [updated] = await db
    .update(collectionItem)
    .set({ quantity: sql`${collectionItem.quantity} + ${delta}`, updatedAt: new Date() })
    .where(
      and(
        eq(collectionItem.userId, userId),
        eq(collectionItem.cardVariantId, cardVariantId),
        eq(collectionItem.language, language),
        eq(collectionItem.condition, condition),
        sql`${collectionItem.quantity} + ${delta} > 0`,
      ),
    )
    .returning({ quantity: collectionItem.quantity });

  if (updated) {
    return {
      quantity: updated.quantity,
      cardTotal: await getCardTotal(userId, cardId),
      cardId,
      removed: false,
    };
  }

  // The decrement would have hit zero (or below): delete the stack.
  await db
    .delete(collectionItem)
    .where(
      and(
        eq(collectionItem.userId, userId),
        eq(collectionItem.cardVariantId, cardVariantId),
        eq(collectionItem.language, language),
        eq(collectionItem.condition, condition),
      ),
    );
  return { quantity: 0, cardTotal: await getCardTotal(userId, cardId), cardId, removed: true };
}

async function getStackQuantity(
  userId: string,
  cardVariantId: string,
  language: string,
  condition: string,
): Promise<number> {
  const rows = await db.execute<{ quantity: number }>(sql`
    select quantity from collection_item
    where user_id = ${userId} and card_variant_id = ${cardVariantId}
      and language = ${language}::card_language and condition = ${condition}::condition
    limit 1
  `);
  return Number(rows.rows[0]?.quantity ?? 0);
}

/** Full upsert used by the detail form and by CSV import. */
export async function upsertEntry(
  userId: string,
  input: CollectionEntryInput,
): Promise<QuantityResult> {
  const parsed = collectionEntrySchema.parse(input);
  const cardId = await resolveCardId(parsed.cardVariantId);

  if (parsed.quantity === 0) {
    await db
      .delete(collectionItem)
      .where(
        and(
          eq(collectionItem.userId, userId),
          eq(collectionItem.cardVariantId, parsed.cardVariantId),
          eq(collectionItem.language, parsed.language),
          eq(collectionItem.condition, parsed.condition),
        ),
      );
    return { quantity: 0, cardTotal: await getCardTotal(userId, cardId), cardId, removed: true };
  }

  // The DB enforces that price and currency are set together; mirror that here so
  // the user gets a validation message instead of a constraint violation.
  const hasPrice = parsed.purchasePrice !== null && parsed.purchasePrice !== undefined;
  const purchaseCurrency = hasPrice ? (parsed.purchaseCurrency ?? 'EUR') : null;

  const [row] = await db
    .insert(collectionItem)
    .values({
      userId,
      cardId,
      cardVariantId: parsed.cardVariantId,
      language: parsed.language,
      condition: parsed.condition,
      quantity: parsed.quantity,
      purchasePrice: hasPrice ? String(parsed.purchasePrice) : null,
      purchaseCurrency,
      purchaseDate: parsed.purchaseDate ?? null,
      notes: parsed.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [
        collectionItem.userId,
        collectionItem.cardVariantId,
        collectionItem.language,
        collectionItem.condition,
      ],
      set: {
        quantity: sql`excluded.quantity`,
        purchasePrice: sql`excluded.purchase_price`,
        purchaseCurrency: sql`excluded.purchase_currency`,
        purchaseDate: sql`excluded.purchase_date`,
        notes: sql`excluded.notes`,
        updatedAt: new Date(),
      },
    })
    .returning({ quantity: collectionItem.quantity });

  return {
    quantity: row?.quantity ?? parsed.quantity,
    cardTotal: await getCardTotal(userId, cardId),
    cardId,
    removed: false,
  };
}

export async function deleteEntry(userId: string, entryId: string): Promise<void> {
  await db
    .delete(collectionItem)
    .where(and(eq(collectionItem.userId, userId), eq(collectionItem.id, entryId)));
}

/* ---------------------------------------------------------------- wishlist */

export const wishlistEntrySchema = z.object({
  cardVariantId: z.string().min(1).max(128),
  language: z.enum(CARD_LANGUAGES),
  targetPrice: z.number().min(0).max(1_000_000).nullish(),
  targetCurrency: z.enum(CURRENCIES).nullish(),
  priority: z.number().int().min(1).max(5).default(3),
  notes: z.string().max(1_000).nullish(),
});

export async function addToWishlist(
  userId: string,
  input: z.infer<typeof wishlistEntrySchema>,
): Promise<void> {
  const parsed = wishlistEntrySchema.parse(input);
  const cardId = await resolveCardId(parsed.cardVariantId);
  const hasTarget = parsed.targetPrice !== null && parsed.targetPrice !== undefined;

  await db
    .insert(wishlistItem)
    .values({
      userId,
      cardId,
      cardVariantId: parsed.cardVariantId,
      language: parsed.language,
      targetPrice: hasTarget ? String(parsed.targetPrice) : null,
      targetCurrency: hasTarget ? (parsed.targetCurrency ?? 'EUR') : null,
      priority: parsed.priority,
      notes: parsed.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [wishlistItem.userId, wishlistItem.cardVariantId, wishlistItem.language],
      set: {
        targetPrice: sql`excluded.target_price`,
        targetCurrency: sql`excluded.target_currency`,
        priority: sql`excluded.priority`,
        notes: sql`excluded.notes`,
      },
    });
}

export async function removeFromWishlist(
  userId: string,
  cardVariantId: string,
  language: string,
): Promise<void> {
  await db.execute(sql`
    delete from wishlist_item
    where user_id = ${userId} and card_variant_id = ${cardVariantId}
      and language = ${language}::card_language
  `);
}

export interface WishlistRow {
  id: string;
  cardId: string;
  cardName: string;
  localId: string;
  imageBaseUrl: string | null;
  setName: string;
  setId: string;
  variantId: string;
  variantType: string;
  language: string;
  priority: number;
  targetPrice: string | null;
  targetCurrency: string | null;
  notes: string | null;
  marketPrice: string | null;
  marketCurrency: string | null;
  marketConfidence: string | null;
  marketUrl: string | null;
}

export async function listWishlist(userId: string, cardLanguage: string): Promise<WishlistRow[]> {
  const result = await db.execute<SqlRow<WishlistRow>>(sql`
    select
      w.id, w.card_id as "cardId",
      coalesce(ct.name, c.name) as "cardName",
      coalesce(ct.local_id, c.local_id) as "localId",
      coalesce(ct.image_base_url, c.image_base_url, c.fallback_image_url) as "imageBaseUrl",
      coalesce(st.name, s.name) as "setName",
      s.id as "setId",
      w.card_variant_id as "variantId",
      v.variant_type as "variantType",
      w.language, w.priority,
      w.target_price::text as "targetPrice",
      w.target_currency as "targetCurrency",
      w.notes,
      pr.market::text as "marketPrice",
      pr.currency as "marketCurrency",
      pr.confidence as "marketConfidence",
      pr.source_url as "marketUrl"
    from wishlist_item w
    join card c on c.id = w.card_id
    join card_variant v on v.id = w.card_variant_id
    join set s on s.id = c.set_id
    left join set_translation st on st.set_id = s.id and st.language = ${cardLanguage}::card_language
    left join card_translation ct on ct.card_id = c.id and ct.language = ${cardLanguage}::card_language
    left join lateral (
      select p.market, p.currency, p.confidence, p.source_url
      from card_price p
      where p.card_variant_id = w.card_variant_id and p.market is not null
      order by (p.confidence = 'exact') desc,
               array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'], p.provider) nulls last
      limit 1
    ) pr on true
    where w.user_id = ${userId}
    order by w.priority asc, pr.market desc nulls last
  `);
  return result.rows;
}

/* -------------------------------------------------------------- collection */

export interface CollectionFilters {
  language?: string[];
  condition?: string[];
  setId?: string[];
  eraId?: string[];
  variantType?: string[];
  rarity?: string[];
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'value' | 'recent' | 'name' | 'number';
  limit?: number;
  offset?: number;
}

export interface CollectionListRow {
  id: string;
  cardId: string;
  cardName: string;
  localId: string;
  imageBaseUrl: string | null;
  setId: string;
  setName: string;
  rarity: string | null;
  variantId: string;
  variantType: string;
  language: string;
  condition: string;
  quantity: number;
  purchasePrice: string | null;
  purchaseCurrency: string | null;
  marketPrice: string | null;
  marketCurrency: string | null;
  marketConfidence: string | null;
  total: number;
}

export async function listCollection(
  userId: string,
  cardLanguage: string,
  filters: CollectionFilters = {},
): Promise<{ rows: CollectionListRow[]; total: number }> {
  const conditions = [sql`ci.user_id = ${userId}`];
  if (filters.language?.length) conditions.push(sql`ci.language = any(${sql.param(filters.language)}::card_language[])`);
  if (filters.condition?.length) conditions.push(sql`ci.condition = any(${sql.param(filters.condition)}::condition[])`);
  if (filters.setId?.length) conditions.push(sql`c.set_id = any(${sql.param(filters.setId)}::text[])`);
  if (filters.eraId?.length) conditions.push(sql`se.era_id = any(${sql.param(filters.eraId)}::text[])`);
  if (filters.variantType?.length) conditions.push(sql`v.variant_type = any(${sql.param(filters.variantType)}::variant_type[])`);
  if (filters.rarity?.length) conditions.push(sql`c.rarity = any(${sql.param(filters.rarity)}::text[])`);
  if (filters.search) {
    const like = `%${filters.search}%`;
    conditions.push(sql`(c.name ilike ${like} or ct.name ilike ${like} or c.local_id = ${filters.search})`);
  }
  if (filters.minPrice !== undefined) conditions.push(sql`coalesce(pr.market, 0) >= ${filters.minPrice}`);
  if (filters.maxPrice !== undefined) conditions.push(sql`coalesce(pr.market, 0) <= ${filters.maxPrice}`);

  const orderBy =
    filters.sort === 'name'
      ? sql`coalesce(ct.name, c.name) asc`
      : filters.sort === 'number'
        ? sql`c.set_id asc, c.sort_index asc`
        : filters.sort === 'recent'
          ? sql`ci.created_at desc`
          : sql`(coalesce(pr.market, 0) * ci.quantity) desc`;

  const result = await db.execute<SqlRow<CollectionListRow>>(sql`
    select
      ci.id, ci.card_id as "cardId",
      coalesce(ct.name, c.name) as "cardName",
      coalesce(ct.local_id, c.local_id) as "localId",
      coalesce(ct.image_base_url, c.image_base_url, c.fallback_image_url) as "imageBaseUrl",
      c.set_id as "setId",
      coalesce(st.name, s.name) as "setName",
      c.rarity,
      ci.card_variant_id as "variantId",
      v.variant_type as "variantType",
      ci.language, ci.condition, ci.quantity,
      ci.purchase_price::text as "purchasePrice",
      ci.purchase_currency as "purchaseCurrency",
      pr.market::text as "marketPrice",
      pr.currency as "marketCurrency",
      pr.confidence as "marketConfidence",
      count(*) over ()::int as "total"
    from collection_item ci
    join card c on c.id = ci.card_id
    join card_variant v on v.id = ci.card_variant_id
    join set s on s.id = c.set_id
    join series se on se.id = s.series_id
    left join set_translation st on st.set_id = s.id and st.language = ${cardLanguage}::card_language
    left join card_translation ct on ct.card_id = c.id and ct.language = ${cardLanguage}::card_language
    left join lateral (
      select p.market, p.currency, p.confidence from card_price p
      where p.card_variant_id = ci.card_variant_id and p.market is not null
      order by (p.confidence = 'exact') desc,
               array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'], p.provider) nulls last
      limit 1
    ) pr on true
    where ${sql.join(conditions, sql` and `)}
    order by ${orderBy}
    limit ${filters.limit ?? 60} offset ${filters.offset ?? 0}
  `);

  const total = result.rows[0]?.total ?? 0;
  logger.debug('collection.list', { userId, rows: result.rows.length, total });
  return { rows: result.rows.map((r) => ({ ...r, quantity: Number(r.quantity) })), total: Number(total) };
}

/** Distinct facet values, so filter menus only offer options that exist. */
export async function getCollectionFacets(userId: string) {
  const result = await db.execute<{
    languages: string[] | null;
    conditions: string[] | null;
    rarities: string[] | null;
    variants: string[] | null;
    sets: Array<{ id: string; name: string }> | null;
  }>(sql`
    select
      (select array_agg(distinct ci.language::text) from collection_item ci where ci.user_id = ${userId}) as languages,
      (select array_agg(distinct ci.condition::text) from collection_item ci where ci.user_id = ${userId}) as conditions,
      (select array_agg(distinct c.rarity) from collection_item ci join card c on c.id = ci.card_id
        where ci.user_id = ${userId} and c.rarity is not null) as rarities,
      (select array_agg(distinct v.variant_type::text) from collection_item ci join card_variant v on v.id = ci.card_variant_id
        where ci.user_id = ${userId}) as variants,
      (select json_agg(distinct jsonb_build_object('id', s.id, 'name', s.name))
        from collection_item ci join card c on c.id = ci.card_id join set s on s.id = c.set_id
        where ci.user_id = ${userId}) as sets
  `);

  const row = result.rows[0];
  return {
    languages: row?.languages ?? [],
    conditions: row?.conditions ?? [],
    rarities: (row?.rarities ?? []).filter(Boolean).sort(),
    variants: row?.variants ?? [],
    sets: (row?.sets ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export { card, cardVariant };
