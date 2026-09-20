import { finish } from './_bootstrap';

/**
 * Daily snapshot: FX rate, price history, per-user portfolio value.
 * Safe to re-run on the same day - every write is an upsert keyed on the date.
 */
async function main() {
  const { withSyncRun } = await import('@/server/sync/run');
  const { runDailySnapshot } = await import('@/server/sync/snapshot');

  await withSyncRun('snapshot', 'cli', (ctx) => runDailySnapshot(ctx));
  await finish(0);
}

main().catch(async (error) => {
  console.error(error);
  await finish(1);
});
