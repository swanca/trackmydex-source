import { finish, parseArgs } from './_bootstrap';

/**
 * Sealed product catalogue and prices, from TCGCSV.
 *
 *   npm run sync:sealed                    every group, both categories
 *   npm run sync:sealed -- --limit 4       first 4 groups per category, a smoke run
 *   npm run sync:sealed -- --group 24269   one TCGplayer group
 *
 * Intended to run daily, after TCGCSV refreshes around 20:00 UTC. A full pass is
 * roughly 1,400 requests, which is why it is a separate job from the card price
 * refresh rather than bolted onto it.
 */
async function main() {
  const args = parseArgs();
  const { withSyncRun } = await import('@/server/sync/run');
  const { syncSealed } = await import('@/server/sync/sealed');

  const { result } = await withSyncRun('sealed', 'cli', (ctx) =>
    syncSealed(ctx, {
      ...(typeof args.group === 'string' ? { groupId: Number(args.group) } : {}),
      ...(typeof args.limit === 'string' ? { limit: Number(args.limit) } : {}),
    }),
  );

  console.log(result);
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
