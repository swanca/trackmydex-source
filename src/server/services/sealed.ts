import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, type SqlRow } from '@/db';
import { SEALED_KINDS, SEALED_STATES } from '@/db/schema/enums';
import { logger } from '@/lib/logger';
import { NotFoundError } from './collection';

/**
 * Sealed products: browsing, and the owned stacks that go with them.
 *
 * Mirrors the card collection service deliberately - same quantity stepper
 * semantics, same "delete the row at zero" rule, same shape of list row - so the
 * UI can treat a booster box and a Charizard the same way wherever it makes
 * sense to.
 */

export const sealedEntrySchema = z.object({
  sealedProductId: z.string().min(1).max(64),
  state: z.enum(SEALED_STATES).default('sealed'),
  quantity: z.number().int().min(0).max(9999),
  purchasePrice: z.number().min(0).max(1_000_000).nullable().optional(),
  purchaseCurrency: z.enum(['EUR', 'USD']).nullable().optional(),
  purchaseDate: z.string().date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type SealedEntryInput = z.infer<typeof sealedEntrySchema>;

export const sealedQuantitySchema = z.object({
  sealedProductId: z.string().min(1).max(64),
  state: z.enum(SEALED_STATES).default('sealed'),
  delta: z.number().int().min(-999).max(999),
});

export interface SealedQuantityResult {
  quantity: number;
  removed: boolean;
}

/**
 * One-tap +/- on a sealed stack.
 *
 * Same contract as the card stepper: the row is created on first increment and
 * deleted when it reaches zero, so "owned" is simply "a row exists" and no
 * caller has to filter out zero-quantity rows.
 */
export async function adjustSealedQuantity(
  userId: string,
  input: z.infer<typeof sealedQuantitySchema>,
): Promise<SealedQuantityResult> {
  const exists = await db.execute<SqlRow<{ id: string }>>(sql`
    select id from sealed_product where id = ${input.sealedProductId} limit 1
  `);
  if (exists.rows.length === 0) {
    throw new NotFoundError('That sealed product does not exist');
  }

  if (input.delta === 0) {
    const current = await db.execute<SqlRow<{ quantity: number }>>(sql`
      select quantity from sealed_item
      where user_id = ${userId} and sealed_product_id = ${input.sealedProductId}
        and state = ${input.state}::sealed_state
      limit 1
    `);
    return { quantity: Number(current.rows[0]?.quantity ?? 0), removed: false };
  }

  if (input.delta > 0) {
    const result = await db.execute<SqlRow<{ quantity: number }>>(sql`
      insert into sealed_item (user_id, sealed_product_id, state, quantity)
      values (${userId}, ${input.sealedProductId}, ${input.state}::sealed_state, ${input.delta})
      on conflict (user_id, sealed_product_id, state)
      do update set quantity = least(sealed_item.quantity + ${input.delta}, 9999), updated_at = now()
      returning quantity
    `);
    return { quantity: Number(result.rows[0]?.quantity ?? input.delta), removed: false };
  }

  // Decrement is a guarded UPDATE, never an upsert. `quantity > 0` is a check
  // constraint, so letting the row reach zero raises SQLSTATE 23514 and the
  // whole request 500s before any cleanup can run. The guard makes the update
  // match nothing when it would empty the stack, and the delete below handles
  // that case.
  const updated = await db.execute<SqlRow<{ quantity: number }>>(sql`
    update sealed_item
    set quantity = quantity + ${input.delta}, updated_at = now()
    where user_id = ${userId}
      and sealed_product_id = ${input.sealedProductId}
      and state = ${input.state}::sealed_state
      and quantity + ${input.delta} > 0
    returning quantity
  `);
  if (updated.rows[0]) {
    return { quantity: Number(updated.rows[0].quantity), removed: false };
  }

  await db.execute(sql`
    delete from sealed_item
    where user_id = ${userId}
      and sealed_product_id = ${input.sealedProductId}
      and state = ${input.state}::sealed_state
  `);
  return { quantity: 0, removed: true };
}

/** Full edit: quantity, what was paid, and when. */
export async function upsertSealedEntry(userId: string, input: SealedEntryInput): Promise<string> {
  const exists = await db.execute<SqlRow<{ id: string }>>(sql`
    select id from sealed_product where id = ${input.sealedProductId} limit 1
  `);
  if (exists.rows.length === 0) {
    throw new NotFoundError('That sealed product does not exist');
  }

  if (input.quantity === 0) {
    await db.execute(sql`
      delete from sealed_item
      where user_id = ${userId}
        and sealed_product_id = ${input.sealedProductId}
        and state = ${input.state}::sealed_state
    `);
    return '';
  }

  const price = input.purchasePrice ?? null;
  // The table has a check constraint pairing the two; normalising here turns a
  // would-be 500 into the obvious behaviour.
  const currency = price === null ? null : (input.purchaseCurrency ?? 'EUR');

  const result = await db.execute<SqlRow<{ id: string }>>(sql`
    insert into sealed_item
      (user_id, sealed_product_id, state, quantity, purchase_price, purchase_currency, purchase_date, notes)
    values (
      ${userId}, ${input.sealedProductId}, ${input.state}::sealed_state, ${input.quantity},
      ${price}, ${currency}::currency, ${input.purchaseDate ?? null}::date, ${input.notes ?? null}
    )
    on conflict (user_id, sealed_product_id, state) do update set
      quantity = excluded.quantity,
      purchase_price = excluded.purchase_price,
      purchase_currency = excluded.purchase_currency,
      purchase_date = excluded.purchase_date,
      notes = excluded.notes,
      updated_at = now()
    returning id
  `);
  return result.rows[0]?.id ?? '';
}

export async function deleteSealedEntry(userId: string, entryId: string): Promise<void> {
  const result = await db.execute(sql`
    delete from sealed_item where id = ${entryId}::uuid and user_id = ${userId}
  `);
  if (result.rowCount === 0) throw new NotFoundError('That item is not in your collection');
}

export interface SealedBrowseFilters {
  /** Printed-card language whose set names should be searched and shown. */
  language_?: string;
  search?: string;
  kind?: string[];
  language?: string[];
  setId?: string;
  groupId?: number;
  sort?: 'value' | 'recent' | 'name';
  limit?: number;
  offset?: number;
}

export interface SealedBrowseRow {
  id: string;
  name: string;
  kind: string;
  language: string;
  groupName: string;
  /** The set's name in the reader's language, when we know it. */
  setLabel: string | null;
  setId: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  releasedOn: string | null;
  marketPrice: string | null;
  marketCurrency: string | null;
  ownedQuantity: number;
  total: number;
}

/**
 * Browse the sealed catalogue.
 *
 * `ownedQuantity` is summed across states so a card-style "you own this" badge
 * works without a second round trip.
 */
export async function browseSealed(
  userId: string | null,
  filters: SealedBrowseFilters = {},
): Promise<{ rows: SealedBrowseRow[]; total: number }> {
  const conditions = [sql`true`];

  if (filters.search) {
    const like = `%${filters.search}%`;
    // Product names come from TCGplayer and are English only, so searching
    // them alone means "Origine Perdue" finds nothing while "Lost Origin"
    // works. The linked set's translated name is what makes the reader's own
    // language searchable.
    conditions.push(
      sql`(p.name ilike ${like} or p.source_group_name ilike ${like} or st.name ilike ${like})`,
    );
  }
  if (filters.kind?.length) {
    conditions.push(sql`p.kind = any(${sql.param(filters.kind)}::sealed_kind[])`);
  }
  if (filters.language?.length) {
    conditions.push(sql`p.language = any(${sql.param(filters.language)}::card_language[])`);
  }
  if (filters.setId) conditions.push(sql`p.set_id = ${filters.setId}`);
  if (filters.groupId) conditions.push(sql`p.source_group_id = ${filters.groupId}`);

  const orderBy =
    filters.sort === 'name'
      ? sql`p.name asc`
      : filters.sort === 'recent'
        ? sql`p.released_on desc nulls last, p.name asc`
        : sql`pr.market desc nulls last, p.name asc`;

  const result = await db.execute<SqlRow<SealedBrowseRow>>(sql`
    select
      p.id, p.name, p.kind, p.language,
      p.source_group_name as "groupName",
      st.name as "setLabel",
      p.set_id as "setId",
      p.image_url as "imageUrl",
      p.product_url as "productUrl",
      p.released_on::text as "releasedOn",
      pr.market::text as "marketPrice",
      pr.currency as "marketCurrency",
      coalesce(owned.quantity, 0)::int as "ownedQuantity",
      count(*) over ()::int as "total"
    from sealed_product p
    left join set_translation st
      on st.set_id = p.set_id and st.language = ${(filters.language_ ?? 'en')}::card_language
    left join lateral (
      select market, currency from sealed_price
      where sealed_product_id = p.id and market is not null
      limit 1
    ) pr on true
    left join lateral (
      select sum(quantity) as quantity from sealed_item
      where sealed_product_id = p.id and user_id = ${userId ?? null}
    ) owned on ${userId ? sql`true` : sql`false`}
    where ${sql.join(conditions, sql` and `)}
    order by ${orderBy}
    limit ${filters.limit ?? 48} offset ${filters.offset ?? 0}
  `);

  const total = result.rows[0]?.total ?? 0;
  return {
    rows: result.rows.map((r) => ({ ...r, ownedQuantity: Number(r.ownedQuantity) })),
    total: Number(total),
  };
}

export interface OwnedSealedRow {
  id: string;
  sealedProductId: string;
  name: string;
  kind: string;
  language: string;
  groupName: string;
  setLabel: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  state: string;
  quantity: number;
  purchasePrice: string | null;
  purchaseCurrency: string | null;
  marketPrice: string | null;
  marketCurrency: string | null;
  total: number;
}

/** The sealed half of a user's collection. */
export async function listOwnedSealed(
  userId: string,
  options: { limit?: number; offset?: number; sort?: string; language?: string } = {},
): Promise<{ rows: OwnedSealedRow[]; total: number }> {
  const orderBy =
    options.sort === 'name'
      ? sql`p.name asc`
      : options.sort === 'recent'
        ? sql`si.created_at desc`
        : sql`(coalesce(pr.market, 0) * si.quantity) desc`;

  const result = await db.execute<SqlRow<OwnedSealedRow>>(sql`
    select
      si.id,
      si.sealed_product_id as "sealedProductId",
      p.name, p.kind, p.language,
      p.source_group_name as "groupName",
      st.name as "setLabel",
      p.image_url as "imageUrl",
      p.product_url as "productUrl",
      si.state, si.quantity,
      si.purchase_price::text as "purchasePrice",
      si.purchase_currency as "purchaseCurrency",
      pr.market::text as "marketPrice",
      pr.currency as "marketCurrency",
      count(*) over ()::int as "total"
    from sealed_item si
    join sealed_product p on p.id = si.sealed_product_id
    left join set_translation st
      on st.set_id = p.set_id and st.language = ${(options.language ?? 'en')}::card_language
    left join lateral (
      select market, currency from sealed_price
      where sealed_product_id = p.id and market is not null
      limit 1
    ) pr on true
    where si.user_id = ${userId}
    order by ${orderBy}
    limit ${options.limit ?? 60} offset ${options.offset ?? 0}
  `);

  const total = result.rows[0]?.total ?? 0;
  logger.debug('sealed.list_owned', { userId, rows: result.rows.length });
  return {
    rows: result.rows.map((r) => ({ ...r, quantity: Number(r.quantity) })),
    total: Number(total),
  };
}

/** Filter menus only offer what the catalogue actually contains. */
export async function getSealedFacets() {
  const result = await db.execute<SqlRow<{ kind: string; language: string; count: number }>>(sql`
    select kind, language, count(*)::int as count
    from sealed_product
    group by kind, language
    order by count desc
  `);

  const kinds = new Map<string, number>();
  const languages = new Map<string, number>();
  for (const row of result.rows) {
    kinds.set(row.kind, (kinds.get(row.kind) ?? 0) + Number(row.count));
    languages.set(row.language, (languages.get(row.language) ?? 0) + Number(row.count));
  }

  return {
    kinds: SEALED_KINDS.filter((k) => kinds.has(k)).map((k) => ({
      value: k,
      count: kinds.get(k) ?? 0,
    })),
    languages: [...languages.entries()].map(([value, count]) => ({ value, count })),
  };
}
