import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { portfolioSnapshot, user } from '@/db/schema';
import { getPortfolioSummary, summaryToSnapshot } from '@/server/services/portfolio';
import { refreshFxRates } from '@/server/services/fx';
import { compactSnapshots, snapshotPrices } from './prices';
import { snapshotSealedPrices } from './sealed';
import type { SyncContext } from './run';

/**
 * Daily snapshot job.
 *
 * This is the only reason the product can show value over time: no free provider
 * sells historical Pokemon TCG prices, so history is something this instance
 * accumulates. Runs in three steps, each safe to retry on the same day.
 */
export async function runDailySnapshot(ctx: SyncContext) {
  const rate = await refreshFxRates();
  ctx.bump('fxEurUsd', rate);

  const prices = await snapshotPrices(ctx);
  ctx.log.info('snapshot.prices', { rows: prices });

  const sealed = await snapshotSealedPrices(ctx);
  ctx.log.info('snapshot.sealed_prices', { rows: sealed });

  const compacted = await compactSnapshots(ctx);
  if (compacted > 0) ctx.log.info('snapshot.compacted', { rows: compacted });

  const users = await db.select({ id: user.id, currency: user.displayCurrency }).from(user);

  for (const row of users) {
    try {
      const summary = await getPortfolioSummary(row.id, row.currency);
      // Users with an empty collection do not need a row per day. Sealed counts:
      // somebody who only buys booster boxes still has a portfolio worth
      // charting, and testing cards alone would silently exclude them.
      if (summary.totalCards === 0 && summary.sealedUnits === 0) continue;

      await db
        .insert(portfolioSnapshot)
        .values({
          userId: row.id,
          capturedOn: new Date().toISOString().slice(0, 10),
          ...summaryToSnapshot(summary),
        })
        .onConflictDoUpdate({
          target: [portfolioSnapshot.userId, portfolioSnapshot.capturedOn],
          set: {
            currency: sql`excluded.currency`,
            totalValue: sql`excluded.total_value`,
            exactValue: sql`excluded.exact_value`,
            totalSpend: sql`excluded.total_spend`,
            uniqueCards: sql`excluded.unique_cards`,
            totalCards: sql`excluded.total_cards`,
          },
        });

      ctx.bump('portfolioSnapshots');
    } catch (error) {
      await ctx.fail('snapshot', row.id, 'Portfolio snapshot failed', error);
    }
  }

  return ctx.stats;
}
