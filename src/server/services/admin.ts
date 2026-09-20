import { desc, eq, sql } from 'drizzle-orm';
import { db, type SqlRow } from '@/db';
import { cardVariant, syncError, syncRun } from '@/db/schema';
import { listCatalogProviders } from '@/providers/catalog';
import { getEnabledPricingProviders, listPricingProviders } from '@/providers/pricing';

/**
 * Admin reads.
 *
 * The admin area exists so an operator can answer three questions without a
 * database client: is each data source reachable, did the last import work, and
 * which printings are missing a marketplace mapping.
 */

export interface CatalogStats {
  series: number;
  sets: number;
  cards: number;
  variants: number;
  priced: number;
  unmapped: number;
  languages: Array<{ language: string; cards: number }>;
}

export async function getCatalogStats(): Promise<CatalogStats> {
  const counts = await db.execute<{
    series: number;
    sets: number;
    cards: number;
    variants: number;
    priced: number;
    unmapped: number;
  }>(sql`
    select
      (select count(*)::int from series) as series,
      (select count(*)::int from set) as sets,
      (select count(*)::int from card) as cards,
      (select count(*)::int from card_variant) as variants,
      (select count(distinct card_variant_id)::int from card_price where market is not null) as priced,
      (select count(*)::int from card_variant where cardmarket_product_id is null and tcgplayer_product_id is null) as unmapped
  `);

  const languages = await db.execute<{ language: string; cards: number }>(sql`
    select language::text as language, count(*)::int as cards
    from card_translation
    group by language
    order by cards desc
  `);

  const row = counts.rows[0];
  return {
    series: Number(row?.series ?? 0),
    sets: Number(row?.sets ?? 0),
    cards: Number(row?.cards ?? 0),
    variants: Number(row?.variants ?? 0),
    priced: Number(row?.priced ?? 0),
    unmapped: Number(row?.unmapped ?? 0),
    languages: languages.rows.map((r) => ({ language: r.language, cards: Number(r.cards) })),
  };
}

export async function getRecentRuns(limit = 10) {
  return db
    .select()
    .from(syncRun)
    .orderBy(desc(syncRun.startedAt))
    .limit(limit);
}

export async function getRecentErrors(limit = 25) {
  return db
    .select({
      id: syncError.id,
      scope: syncError.scope,
      ref: syncError.ref,
      message: syncError.message,
      createdAt: syncError.createdAt,
    })
    .from(syncError)
    .orderBy(desc(syncError.createdAt))
    .limit(limit);
}

export interface UnmappedPrinting {
  variantId: string;
  cardId: string;
  cardName: string;
  localId: string;
  setName: string;
  variantType: string;
}

/**
 * Printings with no marketplace product id.
 *
 * These are the cards the product cannot price or link, so they are the
 * operator's actionable backlog. Ordered by set recency because a modern set
 * missing a mapping affects far more users than a 2004 promo.
 */
export async function getUnmappedPrintings(limit = 50): Promise<UnmappedPrinting[]> {
  const result = await db.execute<SqlRow<UnmappedPrinting>>(sql`
    select v.id as "variantId", c.id as "cardId", c.name as "cardName",
           c.local_id as "localId", s.name as "setName", v.variant_type as "variantType"
    from card_variant v
    join card c on c.id = v.card_id
    join set s on s.id = c.set_id
    where v.cardmarket_product_id is null and v.tcgplayer_product_id is null
    order by s.release_date desc nulls last, c.sort_index
    limit ${limit}
  `);
  return result.rows;
}

/**
 * Pins a marketplace mapping by hand and locks it.
 *
 * `mappingLocked` makes the next catalog sync leave these ids alone: an
 * operator who took the trouble to look up the right Cardmarket product should
 * not have it silently reverted the following night.
 */
export async function setMapping(input: {
  cardVariantId: string;
  cardmarketProductId: number | null;
  tcgplayerProductId: number | null;
}): Promise<void> {
  await db
    .update(cardVariant)
    .set({
      cardmarketProductId: input.cardmarketProductId,
      tcgplayerProductId: input.tcgplayerProductId,
      mappingLocked: true,
      updatedAt: new Date(),
    })
    .where(eq(cardVariant.id, input.cardVariantId));
}

export interface ProviderStatus {
  key: string;
  displayName: string;
  kind: 'catalog' | 'pricing';
  enabled: boolean;
  ok: boolean;
  detail: string;
}

/** Live probe of every registered provider. Called only on demand. */
export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const enabledPricing = new Set(getEnabledPricingProviders().map((p) => p.key));

  const catalog = await Promise.all(
    listCatalogProviders().map(async (provider) => {
      const health = await provider.healthCheck();
      return {
        key: provider.key,
        displayName: provider.displayName,
        kind: 'catalog' as const,
        enabled: true,
        ok: health.ok,
        detail: health.detail,
      };
    }),
  );

  const pricing = await Promise.all(
    listPricingProviders().map(async (provider) => {
      const enabled = enabledPricing.has(provider.key);
      if (!enabled) {
        return {
          key: provider.key,
          displayName: provider.displayName,
          kind: 'pricing' as const,
          enabled: false,
          ok: false,
          detail: 'Not listed in PRICING_PROVIDERS',
        };
      }
      const health = await provider.healthCheck();
      return {
        key: provider.key,
        displayName: provider.displayName,
        kind: 'pricing' as const,
        enabled: true,
        ok: health.ok,
        detail: health.detail,
      };
    }),
  );

  return [...catalog, ...pricing];
}

export interface UserRow {
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  lastSeen: string | null;
  stacks: number;
  cards: number;
  wishlist: number;
}

/**
 * Who is actually using this.
 *
 * There is no analytics here and the privacy policy promises there never
 * will be, so this is the only honest answer to "who is using my app": the
 * accounts that exist and what they hold. It is first-party operational
 * data, not tracking - nothing is recorded that signing up did not already
 * create.
 *
 * "Last seen" is the newest session touch rather than a field of our own,
 * which means it is accurate without storing anything extra.
 */
export async function listUsers(limit = 100): Promise<UserRow[]> {
  const result = await db.execute<SqlRow<UserRow>>(sql`
    select
      u.email,
      u.name,
      u.role,
      u.created_at::date::text as "createdAt",
      (select max(s.updated_at)::timestamp(0)::text from session s where s.user_id = u.id)
        as "lastSeen",
      (select count(*)::int from collection_item ci where ci.user_id = u.id) as "stacks",
      (select coalesce(sum(ci.quantity), 0)::int from collection_item ci where ci.user_id = u.id)
        as "cards",
      (select count(*)::int from wishlist_item wi where wi.user_id = u.id) as "wishlist"
    from "user" u
    order by (select max(s.updated_at) from session s where s.user_id = u.id) desc nulls last
    limit ${limit}
  `);
  return result.rows;
}
