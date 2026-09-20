import { finish } from './_bootstrap';

/**
 * Applies pending SQL migrations from ./drizzle.
 *
 * Runs on container start (see docker-compose) so a self-hoster never has to
 * remember a manual step, and is safe to run concurrently: Drizzle takes a
 * transaction and records applied migrations in `__drizzle_migrations`.
 */
async function main() {
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const { sql } = await import('drizzle-orm');
  const { db } = await import('@/db');
  const { logger } = await import('@/lib/logger');

  // Trigram indexes on card and set names are what make `ilike '%pika%'` an
  // index scan across 24,000 cards rather than a sequential one. Drizzle does
  // not emit extension statements, so this runs before the generated SQL that
  // depends on it.
  logger.info('migrate.extensions');
  await db.execute(sql`create extension if not exists pg_trgm`);

  logger.info('migrate.start');
  await migrate(db, { migrationsFolder: './drizzle' });
  logger.info('migrate.done');

  // The most-valuable page reads a precomputed table; fill it once so the
  // deploy that creates it does not leave that page empty until 03:00.
  const { ensureBestPrices } = await import('@/server/sync/best-prices');
  await ensureBestPrices();
  await finish(0);
}

main().catch(async (error) => {
  console.error(error);
  await finish(1);
});
