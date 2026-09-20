import { finish } from './_bootstrap';

/**
 * Nightly catch-up for cards that did not exist last night.
 *
 *   npm run sync:new
 *
 * The full catalogue pass asks the provider for every card in every set -
 * about 33,000 requests - so it runs weekly. That leaves a window: a set
 * released on Tuesday is invisible here until the following Monday, and
 * "why can't I find the card I just pulled" is a fair complaint.
 *
 * This pass lists each set's card ids, which is one request per set, and
 * downloads only the ids it has never seen. On a quiet night that is a few
 * hundred requests and no downloads at all; on release night it is the new
 * set and nothing else.
 *
 * What it deliberately does not do is notice a card that *changed* upstream
 * - a corrected name, a new illustrator credit. Detecting that needs the
 * full payload of every card, which is exactly what the weekly pass is for.
 */
async function main() {
  const { withSyncRun } = await import('@/server/sync/run');
  const { syncCatalog, syncTranslations } = await import('@/server/sync/catalog');
  const { env } = await import('@/lib/env');
  const { logger } = await import('@/lib/logger');

  logger.info('sync-new-cards.start', { languages: env.CATALOG_LANGUAGES });

  // withSyncRun wraps the job's own return value; the stats are on `result`.
  const { result: stats } = await withSyncRun('catalog', 'cli', (ctx) =>
    syncCatalog(ctx, {
      onlyNewCards: true,
      // Prices ride along on payloads we are downloading anyway, so a new
      // card arrives already priced rather than waiting for the 03:00 pass.
      withPrices: true,
      languages: env.CATALOG_LANGUAGES,
    }),
  );

  /**
   * Translate only if something actually arrived.
   *
   * The translation pass is itself a per-card crawl, so running it nightly
   * for nothing would undo the point of this script.
   */
  const added = Number((stats as Record<string, unknown>).cardsUpserted ?? 0);
  if (added > 0) {
    logger.info('sync-new-cards.translating', { added });
    await withSyncRun('translations', 'cli', (ctx) =>
      syncTranslations(ctx, { languages: env.CATALOG_LANGUAGES }),
    );
  } else {
    logger.info('sync-new-cards.nothing_new');
  }

  // Prices moved, so the precomputed "price we show" table is now wrong.
  // Rebuilding it is a couple of seconds after a job that took minutes.
  const { refreshBestPrices } = await import('@/server/sync/best-prices');
  await refreshBestPrices();

  await finish(0);
}

main().catch(async (error) => {
  console.error(error);
  await finish(1);
});
