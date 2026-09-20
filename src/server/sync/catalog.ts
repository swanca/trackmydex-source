import { createHash } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  card,
  cardTranslation,
  cardVariant,
  era,
  series,
  set,
  setTranslation,
} from '@/db/schema';
import type { CardLanguage } from '@/db/schema/enums';
import { ERAS, eraForSeries } from '@/lib/catalog/eras';
import { cardSortIndex } from '@/lib/catalog/sort';
import { env } from '@/lib/env';
import { mapWithConcurrency } from '@/lib/http';
import { getCatalogProvider } from '@/providers/catalog';
import type { ProviderCard, ProviderSet } from '@/providers/catalog/types';
import { upsertPricesFromCatalog } from './prices';
import type { SyncContext } from './run';

/**
 * Catalog ingestion.
 *
 * Idempotent by construction: every write is an upsert keyed on the provider's
 * stable identifier, so re-running a sync updates rather than duplicates. Cards
 * whose provider `updated` timestamp and content hash are unchanged are skipped
 * entirely, which turns a nightly re-sync of 23,000 cards into a few hundred
 * writes.
 */

export interface CatalogSyncOptions {
  /** Restrict to specific sets. Used by the admin "re-sync this set" action. */
  setIds?: string[];
  /** Ignore hashes and rewrite everything. */
  force?: boolean;
  /** Also derive prices from the payload we already downloaded (free). */
  withPrices?: boolean;
  providerKey?: string;
  /** Languages whose own set catalogues should be discovered. */
  languages?: CardLanguage[];
  /** Skip the non-western discovery pass (faster, western-only catalog). */
  skipForeignSets?: boolean;
  /**
   * Fetch only cards we have never seen.
   *
   * The full pass asks the provider for every card in every set - about
   * 33,000 requests - which is fine weekly and far too much nightly. But a
   * card that was printed after our last sync is invisible until that pass
   * runs, so a new release can be missing for a week.
   *
   * Listing a set's card ids is one request, and comparing that list to what
   * we hold costs nothing. This mode pays for the listing (a few hundred
   * requests) and then downloads only the ids that are genuinely new, which
   * is cheap enough to run every night. It cannot notice a card that changed
   * upstream - that is still the weekly pass's job.
   */
  onlyNewCards?: boolean;
}

const CHUNK = 500;

function chunk<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function hashCard(payload: ProviderCard): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        n: payload.name,
        r: payload.rarity,
        i: payload.illustrator,
        c: payload.category,
        t: payload.types,
        v: payload.variants.map((v) => [v.type, v.size, v.cardmarketProductId, v.tcgplayerProductId]),
        img: payload.imageBaseUrl,
      }),
    )
    .digest('hex')
    .slice(0, 64);
}

/** Deterministic variant primary key: stable across re-syncs and human-readable. */
export function variantId(cardId: string, type: string, size: string): string {
  return size === 'standard' ? `${cardId}::${type}` : `${cardId}::${type}::${size}`;
}

export async function syncCatalog(ctx: SyncContext, options: CatalogSyncOptions = {}) {
  const provider = getCatalogProvider(options.providerKey);

  // 1. Eras are ours, not the provider's.
  await db
    .insert(era)
    .values(ERAS.map((e) => ({ ...e })))
    .onConflictDoUpdate({
      target: era.id,
      set: {
        name: sql`excluded.name`,
        startYear: sql`excluded.start_year`,
        endYear: sql`excluded.end_year`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  // 2. Series.
  const providerSeries = await provider.listSeries();
  if (providerSeries.length > 0) {
    await db
      .insert(series)
      .values(
        providerSeries.map((s, index) => ({
          id: s.id,
          eraId: eraForSeries(s.id),
          name: s.name,
          logoUrl: s.logoUrl ?? null,
          sortOrder: index,
        })),
      )
      .onConflictDoUpdate({
        target: series.id,
        set: {
          eraId: sql`excluded.era_id`,
          name: sql`excluded.name`,
          logoUrl: sql`excluded.logo_url`,
          updatedAt: new Date(),
        },
      });
  }
  ctx.bump('series', providerSeries.length);

  // 3. Sets.
  let providerSets = await provider.listSets();
  if (options.setIds?.length) {
    const wanted = new Set(options.setIds);
    providerSets = providerSets.filter((s) => wanted.has(s.id));
  }
  await upsertSets(providerSets);
  ctx.bump('sets', providerSets.length);

  // 3b. Releases with no western equivalent.
  //
  //     Japanese, Korean and Chinese sets are separate sets - 180 JA-only,
  //     36 ZH-only and 95 KO-only at the time of writing - with their own ids,
  //     series and marketplace products. Walking only the English catalogue
  //     would silently omit every one of them, so each configured non-western
  //     language is asked for its own set list and anything unseen is ingested
  //     canonically in that language.
  //
  //     This pass also runs for a targeted `--sets` sync, because otherwise
  //     naming a Japanese set id would match nothing and exit reporting
  //     success. The cheap `listSetIdsForLanguage` probe (one request) decides
  //     whether the expensive full listing is worth doing at all.
  if (options.skipForeignSets !== true) {
    const wanted = options.setIds?.length ? new Set(options.setIds) : null;
    const known = new Set(providerSets.map((s) => s.id));

    for (const language of options.languages ?? env.CATALOG_LANGUAGES) {
      if (language === 'en') continue;
      try {
        const ids = await provider.listSetIdsForLanguage(language);
        const unseen = ids.filter((id) => !known.has(id) && (!wanted || wanted.has(id)));
        if (unseen.length === 0) continue;

        const discovered = (await provider.listSets(language)).filter(
          (s) => !known.has(s.id) && (!wanted || wanted.has(s.id)),
        );
        if (discovered.length === 0) continue;
        for (const s of discovered) known.add(s.id);

        await upsertSeriesFor(discovered, provider, language);
        await upsertSets(discovered);
        providerSets = providerSets.concat(discovered);
        ctx.bump(`foreignSets.${language}`, discovered.length);
        ctx.log.info('catalog.foreign_sets', { language, discovered: discovered.length });
      } catch (error) {
        await ctx.fail('set', language, 'Failed to discover sets for language', error);
      }
    }
  }

  // 4. Cards, set by set. Working per set keeps memory flat and makes a failure
  //    recoverable at set granularity rather than restarting the whole catalog.
  const existing = await loadExistingHashes(providerSets.map((s) => s.id));

  for (const providerSet of providerSets) {
    try {
      await syncSetCards(ctx, provider.key, providerSet, existing, options);
    } catch (error) {
      await ctx.fail('set', providerSet.id, 'Failed to sync set', error);
    }
  }

  return ctx.stats;
}

/**
 * Foreign sets reference series that do not exist in the English catalogue
 * (`SV`, `CS`, `ADV`...). Their rows have to exist before the set FK is
 * satisfied, so they are created here from the same language's series list.
 */
async function upsertSeriesFor(
  sets: readonly ProviderSet[],
  provider: ReturnType<typeof getCatalogProvider>,
  language: CardLanguage,
) {
  const needed = new Set(sets.map((s) => s.seriesId));
  if (needed.size === 0) return;

  const all = await provider.listSeries(language);
  const rows = all
    .filter((s) => needed.has(s.id))
    .map((s, index) => ({
      id: s.id,
      eraId: eraForSeries(s.id),
      name: s.name,
      logoUrl: s.logoUrl ?? null,
      sortOrder: 500 + index,
    }));

  // A set can name a series the series listing does not return; keep the FK
  // satisfiable rather than dropping the set.
  for (const id of needed) {
    if (!rows.some((r) => r.id === id)) {
      rows.push({ id, eraId: eraForSeries(id), name: id, logoUrl: null, sortOrder: 900 });
    }
  }

  await db
    .insert(series)
    .values(rows)
    .onConflictDoUpdate({
      target: series.id,
      set: { name: sql`excluded.name`, logoUrl: sql`excluded.logo_url`, updatedAt: new Date() },
    });
}

async function upsertSets(sets: readonly ProviderSet[]) {
  for (const batch of chunk(sets)) {
    if (batch.length === 0) continue;
    await db
      .insert(set)
      .values(
        batch.map((s, index) => ({
          id: s.id,
          seriesId: s.seriesId,
          name: s.name,
          code: s.code ?? null,
          releaseDate: s.releaseDate ?? null,
          cardCountOfficial: s.cardCountOfficial,
          cardCountTotal: s.cardCountTotal,
          cardCountHolo: s.cardCountHolo ?? null,
          cardCountReverse: s.cardCountReverse ?? null,
          cardCountFirstEd: s.cardCountFirstEd ?? null,
          logoUrl: s.logoUrl ?? null,
          symbolUrl: s.symbolUrl ?? null,
          legalStandard: s.legalStandard ?? false,
          legalExpanded: s.legalExpanded ?? false,
          originLanguage: s.originLanguage ?? 'en',
          sortOrder: index,
        })),
      )
      .onConflictDoUpdate({
        target: set.id,
        set: {
          seriesId: sql`excluded.series_id`,
          name: sql`excluded.name`,
          code: sql`excluded.code`,
          releaseDate: sql`excluded.release_date`,
          cardCountOfficial: sql`excluded.card_count_official`,
          cardCountTotal: sql`excluded.card_count_total`,
          cardCountHolo: sql`excluded.card_count_holo`,
          cardCountReverse: sql`excluded.card_count_reverse`,
          cardCountFirstEd: sql`excluded.card_count_first_ed`,
          logoUrl: sql`excluded.logo_url`,
          symbolUrl: sql`excluded.symbol_url`,
          legalStandard: sql`excluded.legal_standard`,
          legalExpanded: sql`excluded.legal_expanded`,
          originLanguage: sql`excluded.origin_language`,
          updatedAt: new Date(),
        },
      });
  }
}

async function loadExistingHashes(setIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const batch of chunk(setIds, 100)) {
    if (batch.length === 0) continue;
    const rows = await db
      .select({ id: card.id, hash: card.contentHash })
      .from(card)
      .where(inArray(card.setId, batch));
    for (const row of rows) out.set(row.id, row.hash);
  }
  return out;
}

async function syncSetCards(
  ctx: SyncContext,
  providerKey: string,
  providerSet: ProviderSet,
  existing: Map<string, string | null>,
  options: CatalogSyncOptions,
) {
  const provider = getCatalogProvider(providerKey);
  const language = providerSet.originLanguage ?? 'en';
  const cardIds = await provider.listCardIds(providerSet.id, language);
  if (cardIds.length === 0) return;

  // Nightly mode: everything we already hold is left alone, so a set with no
  // new printings costs exactly the one listing request above.
  const wanted = options.onlyNewCards ? cardIds.filter((id) => !existing.has(id)) : cardIds;
  if (wanted.length === 0) {
    ctx.bump('cardsSeen', cardIds.length);
    ctx.bump('cardsSkipped', cardIds.length);
    return;
  }

  const results = await mapWithConcurrency(wanted, env.SYNC_CONCURRENCY, async (cardId) => {
    const payload = await provider.getCard(cardId, language);
    return { cardId, payload };
  });

  const cards: ProviderCard[] = [];
  for (const result of results) {
    if (!result.ok) {
      await ctx.fail('card', String(result.item), 'Fetch failed', result.error);
      continue;
    }
    const { cardId, payload } = result.value;
    if (!payload) {
      await ctx.fail('card', cardId, 'Card not found upstream');
      continue;
    }
    cards.push(payload);
  }

  const changed = options.force
    ? cards
    : cards.filter((c) => existing.get(c.id) !== hashCard(c));

  ctx.bump('cardsSeen', cardIds.length);
  ctx.bump('cardsSkipped', cardIds.length - changed.length);

  if (changed.length > 0) {
    await upsertCards(changed, providerSet.id);
    await upsertVariants(changed);
    ctx.bump('cardsUpserted', changed.length);
  }

  if (options.withPrices !== false) {
    // Prices ride along on the payload we already downloaded: zero extra requests.
    const priced = await upsertPricesFromCatalog(cards);
    ctx.bump('pricesUpserted', priced);
  }

  // Record which languages this set exists in, discovered lazily during the
  // translation pass; here we at least guarantee English.
  await db
    .update(set)
    .set({
      languages: sql`array(select distinct unnest(${set.languages} || array[${language}]::card_language[]))`,
    })
    .where(eq(set.id, providerSet.id));
}

async function upsertCards(cards: readonly ProviderCard[], setId: string) {
  for (const batch of chunk(cards)) {
    await db
      .insert(card)
      .values(
        batch.map((c) => ({
          id: c.id,
          setId: c.setId || setId,
          localId: c.localId,
          sortIndex: String(cardSortIndex(c.localId)),
          name: c.name,
          category: c.category,
          rarity: c.rarity ?? null,
          illustrator: c.illustrator ?? null,
          hp: c.hp ?? null,
          types: c.types,
          stage: c.stage ?? null,
          evolveFrom: c.evolveFrom ?? null,
          regulationMark: c.regulationMark ?? null,
          dexIds: c.dexIds,
          imageBaseUrl: c.imageBaseUrl ?? null,
          extra: c.extra ?? null,
          providerUpdatedAt: c.providerUpdatedAt ? new Date(c.providerUpdatedAt) : null,
          contentHash: hashCard(c),
        })),
      )
      .onConflictDoUpdate({
        target: card.id,
        set: {
          setId: sql`excluded.set_id`,
          localId: sql`excluded.local_id`,
          sortIndex: sql`excluded.sort_index`,
          name: sql`excluded.name`,
          category: sql`excluded.category`,
          rarity: sql`excluded.rarity`,
          illustrator: sql`excluded.illustrator`,
          hp: sql`excluded.hp`,
          types: sql`excluded.types`,
          stage: sql`excluded.stage`,
          evolveFrom: sql`excluded.evolve_from`,
          regulationMark: sql`excluded.regulation_mark`,
          dexIds: sql`excluded.dex_ids`,
          imageBaseUrl: sql`excluded.image_base_url`,
          extra: sql`excluded.extra`,
          providerUpdatedAt: sql`excluded.provider_updated_at`,
          contentHash: sql`excluded.content_hash`,
          updatedAt: new Date(),
        },
      });
  }
}

async function upsertVariants(cards: readonly ProviderCard[]) {
  const rows = cards.flatMap((c) =>
    c.variants.map((v, index) => ({
      id: variantId(c.id, v.type, v.size),
      cardId: c.id,
      variantType: v.type,
      providerVariantId: v.providerVariantId ?? null,
      size: v.size,
      cardmarketProductId: v.cardmarketProductId ?? null,
      tcgplayerProductId: v.tcgplayerProductId ?? null,
      isDefault: index === 0,
    })),
  );

  for (const batch of chunk(rows)) {
    if (batch.length === 0) continue;
    await db
      .insert(cardVariant)
      .values(batch)
      .onConflictDoUpdate({
        target: cardVariant.id,
        set: {
          variantType: sql`excluded.variant_type`,
          providerVariantId: sql`excluded.provider_variant_id`,
          size: sql`excluded.size`,
          // An admin-pinned mapping wins over whatever the provider now says.
          cardmarketProductId: sql`case when ${cardVariant.mappingLocked} then ${cardVariant.cardmarketProductId} else excluded.cardmarket_product_id end`,
          tcgplayerProductId: sql`case when ${cardVariant.mappingLocked} then ${cardVariant.tcgplayerProductId} else excluded.tcgplayer_product_id end`,
          isDefault: sql`excluded.is_default`,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Translation pass.
 *
 * One request per (set, language) returns the whole set in that language, which
 * is what keeps 16 languages affordable. Sets not printed in a language 404 and
 * are recorded as absent rather than retried forever.
 */
export async function syncTranslations(
  ctx: SyncContext,
  options: { languages?: CardLanguage[]; setIds?: string[]; providerKey?: string } = {},
) {
  const provider = getCatalogProvider(options.providerKey);
  const languages = (options.languages ?? env.CATALOG_LANGUAGES).filter((l) => l !== 'en');

  const setRows = options.setIds?.length
    ? await db.select({ id: set.id }).from(set).where(inArray(set.id, options.setIds))
    : await db.select({ id: set.id }).from(set);

  const knownCardIds = new Set(
    (await db.select({ id: card.id }).from(card)).map((row) => row.id),
  );

  for (const language of languages) {
    const results = await mapWithConcurrency(setRows, env.SYNC_CONCURRENCY, async (row) =>
      provider.getSetTranslation(row.id, language),
    );

    const setRowsToWrite: (typeof setTranslation.$inferInsert)[] = [];
    const cardRowsToWrite: (typeof cardTranslation.$inferInsert)[] = [];
    const localisedSetIds: string[] = [];

    for (const result of results) {
      if (!result.ok) {
        await ctx.fail('translation', `${result.item.id}:${language}`, 'Fetch failed', result.error);
        continue;
      }
      const translation = result.value;
      if (!translation) continue; // not printed in this language

      localisedSetIds.push(translation.setId);
      setRowsToWrite.push({
        setId: translation.setId,
        language,
        name: translation.name,
        logoUrl: translation.logoUrl ?? null,
        symbolUrl: translation.symbolUrl ?? null,
        cardCountOfficial: translation.cardCountOfficial ?? null,
        cardCountTotal: translation.cardCountTotal ?? null,
      });

      for (const c of translation.cards) {
        // A translation for a card we have never ingested would violate the FK;
        // skip it and let the next catalog pass pick the card up.
        if (!knownCardIds.has(c.cardId)) continue;
        cardRowsToWrite.push({
          cardId: c.cardId,
          language,
          name: c.name,
          localId: c.localId ?? null,
          imageBaseUrl: c.imageBaseUrl ?? null,
        });
      }
    }

    for (const batch of chunk(setRowsToWrite)) {
      if (batch.length === 0) continue;
      await db
        .insert(setTranslation)
        .values(batch)
        .onConflictDoUpdate({
          target: [setTranslation.setId, setTranslation.language],
          set: {
            name: sql`excluded.name`,
            logoUrl: sql`excluded.logo_url`,
            symbolUrl: sql`excluded.symbol_url`,
            cardCountOfficial: sql`excluded.card_count_official`,
            cardCountTotal: sql`excluded.card_count_total`,
          },
        });
    }

    for (const batch of chunk(cardRowsToWrite)) {
      if (batch.length === 0) continue;
      await db
        .insert(cardTranslation)
        .values(batch)
        .onConflictDoUpdate({
          target: [cardTranslation.cardId, cardTranslation.language],
          set: {
            name: sql`excluded.name`,
            localId: sql`excluded.local_id`,
            imageBaseUrl: sql`excluded.image_base_url`,
          },
        });
    }

    if (localisedSetIds.length > 0) {
      for (const batch of chunk(localisedSetIds, 200)) {
        await db
          .update(set)
          .set({
            languages: sql`array(select distinct unnest(${set.languages} || array[${language}]::card_language[]))`,
          })
          .where(inArray(set.id, batch));
      }
    }

    ctx.bump(`translations.${language}.sets`, localisedSetIds.length);
    ctx.bump(`translations.${language}.cards`, cardRowsToWrite.length);
    ctx.log.info('translations.language_done', {
      language,
      sets: localisedSetIds.length,
      cards: cardRowsToWrite.length,
    });
  }

  return ctx.stats;
}
