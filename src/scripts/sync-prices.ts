import { finish, parseArgs } from './_bootstrap';

/**
 * Price refresh.
 *
 *   npm run sync:prices                     targeted refresh (owned, then new, then stalest)
 *   npm run sync:prices -- --limit 10000
 *   npm run sync:prices -- --set sv08
 *   npm run sync:prices -- --stalest
 *
 * Intended to run daily. It never refreshes the whole catalog in one pass: that
 * would be ~24,000 requests against a free community API for data most users
 * will never look at.
 */
async function main() {
  const args = parseArgs();
  const { withSyncRun } = await import('@/server/sync/run');
  const { syncPrices } = await import('@/server/sync/prices');

  await withSyncRun('prices', 'cli', (ctx) =>
    syncPrices(ctx, {
      ...(typeof args.limit === 'string' ? { limit: Number(args.limit) } : {}),
      ...(typeof args.set === 'string' ? { setId: args.set } : {}),
      stalestFirst: Boolean(args.stalest),
    }),
  );

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
