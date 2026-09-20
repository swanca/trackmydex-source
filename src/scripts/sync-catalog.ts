import { finish, parseArgs } from './_bootstrap';

/**
 * Catalog import.
 *
 *   npm run sync:catalog                      full catalog + translations
 *   npm run sync:catalog -- --sets swsh3,sv1  just those sets
 *   npm run sync:catalog -- --skip-translations
 *   npm run sync:catalog -- --languages fr,ja
 *   npm run sync:catalog -- --force           rewrite even unchanged cards
 *   npm run sync:catalog -- --skip-foreign-sets   western sets only
 *
 * The first full run downloads ~24,000 cards and takes roughly 20-40 minutes
 * depending on SYNC_CONCURRENCY. Later runs only touch what changed upstream.
 */
async function main() {
  const args = parseArgs();
  const { withSyncRun } = await import('@/server/sync/run');
  const { syncCatalog, syncTranslations } = await import('@/server/sync/catalog');
  const { env } = await import('@/lib/env');
  const { logger } = await import('@/lib/logger');

  const setIds =
    typeof args.sets === 'string' ? args.sets.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const languages =
    typeof args.languages === 'string'
      ? (args.languages.split(',').map((s) => s.trim()).filter(Boolean) as typeof env.CATALOG_LANGUAGES)
      : env.CATALOG_LANGUAGES;

  logger.info('sync-catalog.start', {
    sets: setIds?.length ?? 'all',
    languages,
    force: Boolean(args.force),
  });

  await withSyncRun('catalog', 'cli', (ctx) =>
    syncCatalog(ctx, {
      ...(setIds ? { setIds } : {}),
      force: Boolean(args.force),
      withPrices: args['skip-prices'] !== true,
      languages,
      skipForeignSets: Boolean(args['skip-foreign-sets']),
    }),
  );

  if (!args['skip-translations']) {
    await withSyncRun('translations', 'cli', (ctx) =>
      syncTranslations(ctx, { languages, ...(setIds ? { setIds } : {}) }),
    );
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
