import { sql } from 'drizzle-orm';
import { env } from '@/lib/env';
import { db, type SqlRow } from '@/db';
import { cardPrice, sealedPrice, sealedProduct, set as setTable } from '@/db/schema';
import { mapWithConcurrency } from '@/lib/http';
import {
  CATEGORIES,
  fetchGroup,
  listGroups,
  normaliseSetName,
  setNameCandidates,
  type SingleCardPrice,
  type TcgcsvGroup,
} from '@/providers/sealed/tcgcsv';
import type { SyncContext } from './run';
import { logger } from '@/lib/logger';
import { setIdWithSubsets } from '@/lib/catalog/subsets';

/**
 * Sealed product ingestion.
 *
 * One pass per TCGplayer category (western and Japanese), each walking that
 * category's groups. Products and prices arrive together per group, so a group
 * is written as one unit and an interrupted run leaves whole groups done rather
 * than half-priced ones.
 */

const CONCURRENCY = 6;
const CHUNK = 500;

function chunk<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function productId(sourceProductId: number): string {
  return `tcgplayer:${sourceProductId}`;
}

/**
 * Maps normalised set name to our set id, once per run.
 *
 * Linking a sealed product to a set is a convenience - it powers "show me the
 * boxes for this set" - and never a requirement. TCGdex and TCGplayer disagree
 * about set names often enough that demanding a match would drop real products
 * on the floor, so an unmatched group simply keeps its own name.
 */
interface SetIndexEntry {
  id: string;
  releasedOn: string | null;
}

async function loadSetIndex(): Promise<Map<string, SetIndexEntry>> {
  const rows = await db
    .select({
      id: setTable.id,
      name: setTable.name,
      language: setTable.originLanguage,
      releaseDate: setTable.releaseDate,
    })
    .from(setTable);

  const index = new Map<string, SetIndexEntry>();
  for (const row of rows) {
    const entry = { id: row.id, releasedOn: row.releaseDate ?? null };
    const byName = `${row.language}:name:${normaliseSetName(row.name)}`;
    // First writer wins: reprints and variant sets share names, and an
    // arbitrary-but-stable choice beats a random one on each sync.
    if (!index.has(byName)) index.set(byName, entry);

    /**
     * Also index by set id.
     *
     * Japanese sets cannot be matched by name at all - TCGplayer romanises
     * them ("M5: Abyss Eye") while the catalogue stores them in Japanese
     * ("アビスアイ"), so nothing lined up and 8,424 Japanese cards had
     * neither prices nor artwork. Their ids turn out to be the same codes
     * TCGplayer uses as group abbreviations, which matches 120 of our 180.
     */
    const byId = `${row.language}:id:${row.id.toLowerCase()}`;
    if (!index.has(byId)) index.set(byId, entry);
  }
  return index;
}

function matchSet(
  index: Map<string, SetIndexEntry>,
  language: string,
  group: TcgcsvGroup,
): SetIndexEntry | null {
  // The abbreviation is the stronger signal where it exists: it is a code,
  // not prose, so it survives translation and reprints.
  const abbreviation = group.abbreviation?.trim().toLowerCase();
  if (abbreviation) {
    const byId = index.get(`${language}:id:${abbreviation}`);
    if (byId) return byId;
  }

  for (const candidate of setNameCandidates(group.name)) {
    const hit = index.get(`${language}:name:${candidate}`);
    if (hit) return hit;
  }

  return matchSubsetViaParent(index, language, group.name);
}

/**
 * The suffixes TCGplayer appends to name a subset.
 *
 * Kept as prose rather than ids because this matches against a group name,
 * which is the only thing the marketplace gives us to go on.
 */
const SUBSET_SUFFIXES = [
  'classic collection',
  'trainer gallery',
  'galarian gallery',
  'shiny vault',
];

/**
 * Reach a subset through the set it belongs to.
 *
 * The two catalogues name these differently: TCGplayer writes the parent in
 * full and appends the subset - "ME: 30th Celebration Classic Collection" -
 * while TCGdex abbreviates - "30th Classic Collection". Neither name
 * matches the other, so the group was skipped entirely and its thirty cards
 * kept no artwork at all.
 *
 * Both agree on the parent, though. Strip the suffix, match what is left as
 * an ordinary set, then take that set's subset child - which we already
 * know, because folding subsets into parents needed the same map.
 */
function matchSubsetViaParent(
  index: Map<string, SetIndexEntry>,
  language: string,
  groupName: string,
): SetIndexEntry | null {
  const lower = groupName.toLowerCase();
  const suffix = SUBSET_SUFFIXES.find((candidate) => lower.endsWith(candidate));
  if (!suffix) return null;

  const parentName = groupName.slice(0, groupName.length - suffix.length);
  for (const candidate of setNameCandidates(parentName)) {
    const parent = index.get(`${language}:name:${candidate}`);
    if (!parent) continue;
    // `setIdWithSubsets` returns the parent first, then its children.
    const [, child] = setIdWithSubsets(parent.id);
    if (!child) continue;
    const entry = index.get(`${language}:id:${child.toLowerCase()}`);
    if (entry) return entry;
  }
  return null;
}

export interface SealedSyncOptions {
  /** Restrict to one TCGplayer group, for debugging a single set. */
  groupId?: number;
  /** Cap the number of groups processed, for a quick smoke run. */
  limit?: number;
}

export async function syncSealed(ctx: SyncContext, options: SealedSyncOptions = {}) {
  const setIndex = await loadSetIndex();

  for (const category of CATEGORIES) {
    let groups: TcgcsvGroup[];
    try {
      groups = await listGroups(category.id);
    } catch (cause) {
      await ctx.fail('sealed.groups', String(category.id), 'Could not list groups', cause);
      continue;
    }

    if (options.groupId) groups = groups.filter((g) => g.groupId === options.groupId);
    if (options.limit) groups = groups.slice(0, options.limit);

    ctx.log.info('sealed.category_start', { category: category.label, groups: groups.length });

    await mapWithConcurrency(groups, CONCURRENCY, async (group) => {
      let batch;
      try {
        batch = await fetchGroup(category.id, category.language, group);
      } catch (cause) {
        await ctx.fail('sealed.group', String(group.groupId), 'Could not fetch group', cause);
        return;
      }
      /**
       * `products` is the sealed half only.
       *
       * Returning here when it is empty threw away every group that sells
       * nothing but singles - which is exactly what a Trainer Gallery is, so
       * all four of those sets had neither prices nor artwork despite
       * TCGplayer carrying both for all 120 cards.
       */
      if (batch.products.length === 0 && batch.singles.length === 0) return;

      const matched = matchSet(setIndex, category.language, group);

      for (const part of chunk(batch.products)) {
        await db
          .insert(sealedProduct)
          .values(
            part.map((p) => ({
              id: productId(p.sourceProductId),
              sourceProductId: p.sourceProductId,
              sourceGroupId: p.sourceGroupId,
              sourceGroupName: p.sourceGroupName,
              setId: matched?.id ?? null,
              name: p.name,
              kind: p.kind,
              language: p.language,
              imageUrl: p.imageUrl,
              productUrl: p.productUrl,
              // TCGplayer only fills a release date for modern products, so
              // roughly 85% of the catalogue would sort as undated. The set's
              // own release date is the honest stand-in: every product in a
              // group shipped with or after that set.
              releasedOn: p.releasedOn ?? matched?.releasedOn ?? null,
            })),
          )
          .onConflictDoUpdate({
            target: sealedProduct.id,
            set: {
              name: sql`excluded.name`,
              kind: sql`excluded.kind`,
              setId: sql`excluded.set_id`,
              sourceGroupName: sql`excluded.source_group_name`,
              imageUrl: sql`excluded.image_url`,
              productUrl: sql`excluded.product_url`,
              releasedOn: sql`excluded.released_on`,
              updatedAt: sql`now()`,
            },
          });
      }
      if (batch.products.length > 0) ctx.bump('products', batch.products.length);

      const priced = batch.prices.filter((p) => p.market != null || p.low != null);
      for (const part of chunk(priced)) {
        await db
          .insert(sealedPrice)
          .values(
            part.map((p) => ({
              sealedProductId: productId(p.sourceProductId),
              provider: 'tcgplayer',
              // TCGplayer quotes USD. Conversion to the user's display currency
              // happens at read time through fx_rate, never here, so a change in
              // the rate does not require re-ingesting every price.
              currency: 'USD' as const,
              market: p.market?.toFixed(2) ?? null,
              low: p.low?.toFixed(2) ?? null,
              mid: p.mid?.toFixed(2) ?? null,
              high: p.high?.toFixed(2) ?? null,
              directLow: p.directLow?.toFixed(2) ?? null,
              sourceUrl: `https://www.tcgplayer.com/product/${p.sourceProductId}`,
            })),
          )
          .onConflictDoUpdate({
            target: [sealedPrice.sealedProductId, sealedPrice.provider],
            set: {
              market: sql`excluded.market`,
              low: sql`excluded.low`,
              mid: sql`excluded.mid`,
              high: sql`excluded.high`,
              directLow: sql`excluded.direct_low`,
              fetchedAt: sql`now()`,
            },
          });
      }
      ctx.bump('prices', priced.length);

      // Single-card prices ride along in the same two files. TCGdex leaves a
      // freshly released set unpriced for days - the 30th anniversary set had
      // 158 cards and not one price - so this is what keeps a new release from
      // looking broken.
      if (matched && batch.singles.length > 0) {
        const written = await writeSinglePrices(matched.id, batch.singles);
        ctx.bump('cardPrices', written);
      }

      ctx.bump('groups');
    });
  }

  return ctx.stats;
}

/**
 * Daily sealed price history.
 *
 * Same reason as the card snapshot: no provider sells historical sealed prices,
 * so a self-hosted instance accumulates its own from the day it is installed.
 */
export async function snapshotSealedPrices(ctx: SyncContext): Promise<number> {
  const scope =
    env.PRICE_HISTORY_SCOPE === 'all'
      ? sql`true`
      : sql`p.sealed_product_id in (select sealed_product_id from sealed_item)`;

  const result = await db.execute(sql`
    insert into sealed_price_snapshot (sealed_product_id, provider, captured_on, currency, market)
    select p.sealed_product_id, p.provider, current_date, p.currency, p.market
    from sealed_price p
    where p.market is not null and ${scope}
    on conflict (sealed_product_id, captured_on, provider) do update
      set currency = excluded.currency,
          market   = excluded.market
  `);
  const count = result.rowCount ?? 0;
  ctx.bump('sealedPriceSnapshots', count);
  return count;
}

/**
 * Writes TCGplayer prices onto the card variants of one set.
 *
 * Matched on (set, collector number, printing). Anything that does not resolve
 * to a variant we hold is skipped silently: TCGplayer lists products we have
 * no record of, such as box toppers and staff stamps, and inventing rows for
 * them would put prices on cards that do not exist.
 *
 * Filed under its own provider key so it never overwrites a TCGdex reading.
 * The price selector decides which source wins, and both stay visible.
 */
async function writeSinglePrices(
  setId: string,
  singles: readonly SingleCardPrice[],
): Promise<number> {
  const wanted = await db.execute<SqlRow<{ id: string; localId: string; variantType: string }>>(sql`
    select v.id, c.local_id as "localId", v.variant_type as "variantType"
    from card c
    join card_variant v on v.card_id = c.id
    where c.set_id = ${setId}
  `);

  const byKey = new Map<string, string>();
  /** Every variant of a card, so a single-printing card can take any price. */
  const byCard = new Map<string, string[]>();
  for (const row of wanted.rows) {
    byKey.set(`${row.localId}::${row.variantType}`, row.id);
    const existing = byCard.get(row.localId);
    if (existing) existing.push(row.id);
    else byCard.set(row.localId, [row.id]);
  }

  /**
   * Resolve a TCGplayer printing to one of our variants.
   *
   * The two catalogues disagree about printing names more often than you would
   * expect: every card in the 30th anniversary set is `Holofoil` on TCGplayer
   * and `normal` in TCGdex, so an exact-name match found nothing at all for
   * 158 cards that TCGplayer had priced.
   *
   * When a card has exactly one printing in our catalogue, a price for that
   * card can only be a price for that printing, whatever either source calls
   * it. When it has several, a mismatch is genuinely ambiguous and the price
   * is dropped rather than filed against a guess.
   */
  function resolveVariant(localId: string, variantType: string): string | null {
    const exact = byKey.get(`${localId}::${variantType}`);
    if (exact) return exact;
    const all = byCard.get(localId);
    return all?.length === 1 ? all[0]! : null;
  }

  const rows = singles
    .map((single) => {
      const variantId = resolveVariant(single.localId, single.variantType);
      if (!variantId) return null;
      return {
        cardVariantId: variantId,
        provider: 'tcgcsv.tcgplayer',
        currency: 'USD' as const,
        market: single.market?.toFixed(2) ?? null,
        low: single.low?.toFixed(2) ?? null,
        mid: single.mid?.toFixed(2) ?? null,
        high: single.high?.toFixed(2) ?? null,
        directLow: single.directLow?.toFixed(2) ?? null,
        confidence: 'exact' as const,
        sourceProductId: String(single.sourceProductId),
        sourceUrl: `https://www.tcgplayer.com/product/${single.sourceProductId}`,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  /**
   * Borrow artwork where the catalogue provider has none.
   *
   * Only ever written when our own image is missing, and into a separate
   * column, so a later catalogue sync that finally supplies the real artwork
   * wins without this needing to be undone.
   */
  const artwork = singles
    .filter((single) => single.imageUrl)
    .map((single) => ({ localId: single.localId, url: single.imageUrl! }));

  if (artwork.length > 0) {
    for (const part of chunk(artwork)) {
      await db.execute(sql`
        update card c
        set fallback_image_url = v.url
        from (values ${sql.join(
          part.map((row) => sql`(${row.localId}, ${row.url})`),
          sql`, `,
        )}) as v(local_id, url)
        where c.set_id = ${setId}
          and c.local_id = v.local_id
          and c.image_base_url is null
          and c.fallback_image_url is distinct from v.url
      `);
    }
  }

  await writeArtworkByName(setId, singles);

  if (rows.length === 0) return 0;

  for (const part of chunk(rows)) {
    await db
      .insert(cardPrice)
      .values(part)
      .onConflictDoUpdate({
        target: [cardPrice.cardVariantId, cardPrice.provider],
        set: {
          market: sql`excluded.market`,
          low: sql`excluded.low`,
          mid: sql`excluded.mid`,
          high: sql`excluded.high`,
          directLow: sql`excluded.direct_low`,
          sourceProductId: sql`excluded.source_product_id`,
          sourceUrl: sql`excluded.source_url`,
          fetchedAt: sql`now()`,
        },
      });
  }
  return rows.length;
}


/**
 * Normalised for comparing a card name to a marketplace product name.
 *
 * TCGplayer qualifies reprints that our catalogue leaves bare - "Gengar
 * (Prime)", "Metagross (Delta Species)", "Palkia LV.X" - so the trailing
 * qualifier is dropped before comparing. Accents and punctuation go too,
 * because the two sides do not agree on them either.
 */
export function nameKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+lv\s*\.?\s*x$/, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * Last-resort artwork matching, by name.
 *
 * A reprint collection numbers its cards by the original printing -
 * Charizard in the 30th Classic Collection is "4/102" where our catalogue
 * says "001" - so the usual number match finds nothing and all thirty cards
 * end up with no image at all, in a set the provider publishes without any.
 *
 * Only runs for cards that have no image from either source, and only
 * writes a name that is unambiguous on *both* sides: one card, one product.
 * Darkrai & Cresselia LEGEND is two halves sharing a name against two
 * products sharing a name, so it is left alone rather than guessed at - a
 * wrong picture on a card is worse than a missing one, because nothing
 * about it looks wrong.
 */
async function writeArtworkByName(
  setId: string,
  singles: readonly SingleCardPrice[],
): Promise<void> {
  const byName = new Map<string, { url: string; count: number }>();
  for (const single of singles) {
    if (!single.imageUrl || !single.name) continue;
    const key = nameKey(single.name);
    if (!key) continue;
    const seen = byName.get(key);
    if (seen) seen.count += 1;
    else byName.set(key, { url: single.imageUrl, count: 1 });
  }
  if (byName.size === 0) return;

  const missing = await db.execute<{ id: string; name: string }>(sql`
    select id, name from card
    where set_id = ${setId}
      and image_base_url is null
      and fallback_image_url is null
  `);
  if (missing.rows.length === 0) return;

  const byCardName = new Map<string, number>();
  for (const row of missing.rows) {
    const key = nameKey(row.name);
    byCardName.set(key, (byCardName.get(key) ?? 0) + 1);
  }

  const updates: Array<{ id: string; url: string }> = [];
  for (const row of missing.rows) {
    const key = nameKey(row.name);
    const product = byName.get(key);
    if (!product || product.count !== 1) continue;
    if (byCardName.get(key) !== 1) continue;
    updates.push({ id: row.id, url: product.url });
  }
  if (updates.length === 0) return;

  for (const part of chunk(updates)) {
    await db.execute(sql`
      update card c
      set fallback_image_url = v.url
      from (values ${sql.join(
        part.map((row) => sql`(${row.id}, ${row.url})`),
        sql`, `,
      )}) as v(id, url)
      where c.id = v.id and c.image_base_url is null and c.fallback_image_url is null
    `);
  }

  logger.info('sealed.artwork_by_name', {
    setId,
    matched: updates.length,
    stillMissing: missing.rows.length - updates.length,
  });
}
