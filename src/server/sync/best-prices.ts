import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { logger } from '@/lib/logger';

/**
 * Rebuild the one price we show per card.
 *
 * Ordering a catalogue by price cannot use an index while the price is
 * computed per row. The most-valuable list ran the provider-preference
 * lookup once per card - 33,807 laterals, 150,000 pages, half a second -
 * before it could sort anything.
 *
 * The rule here is deliberately identical to the one the grid uses to pick
 * which reading to display: the card's default printing, preferring an
 * exact-confidence row, then the provider order. A list ordered by one
 * number and labelled with another would be worse than a slow list.
 *
 * Whole-table rebuild rather than incremental. It takes a couple of seconds
 * on 33,000 cards, runs after a sync that already took minutes, and an
 * incremental version would need to know which cards a price change
 * touched - which is exactly the bookkeeping that goes wrong silently.
 */
export async function refreshBestPrices(): Promise<number> {
  const started = Date.now();

  const result = await db.execute<{ count: number }>(sql`
    with best as (
      select
        c.id as card_id,
        pr.variant_id,
        pr.market,
        pr.currency
      from card c
      join lateral (
        select v.id as variant_id
        from card_variant v
        where v.card_id = c.id
        order by v.is_default desc, v.variant_type
        limit 1
      ) dv on true
      join lateral (
        select p.market, p.currency, dv.variant_id
        from card_price p
        where p.card_variant_id = dv.variant_id and p.market is not null
        order by (p.confidence = 'exact') desc,
                 array_position(
                   array['tcgdex.cardmarket','tcgdex.tcgplayer','tcgcsv.tcgplayer','pokemontcgio'],
                   p.provider
                 ) nulls last
        limit 1
      ) pr on true
    ),
    upserted as (
      insert into card_best_price (card_id, card_variant_id, market, currency, updated_at)
      select card_id, variant_id, market, currency, now() from best
      on conflict (card_id) do update set
        card_variant_id = excluded.card_variant_id,
        market = excluded.market,
        currency = excluded.currency,
        updated_at = now()
      returning card_id
    )
    select count(*)::int as count from upserted
  `);

  // A card whose last price disappeared upstream must leave the table, or it
  // keeps a price it no longer has and sorts above cards that do.
  await db.execute(sql`
    delete from card_best_price bp
    where not exists (
      select 1
      from card_variant v
      join card_price p on p.card_variant_id = v.id
      where v.card_id = bp.card_id and p.market is not null
    )
  `);

  const count = result.rows[0]?.count ?? 0;
  logger.info('best_prices.refreshed', { cards: count, durationMs: Date.now() - started });
  return count;
}

/**
 * Populate the table if nothing has yet.
 *
 * The sort reads `card_best_price` directly, so an empty table means an
 * empty most-valuable page - which is exactly the state a fresh deploy is
 * in, between the migration creating the table and the first nightly sync
 * filling it. Nobody should have to wait until 03:00 for a page to work.
 *
 * Called from the migration step, so it runs once on the deploy that
 * introduces the table and costs a single cheap count on every restart
 * after that.
 */
export async function ensureBestPrices(): Promise<void> {
  const result = await db.execute<{ empty: boolean }>(
    sql`select not exists (select 1 from card_best_price) as empty`,
  );
  if (!result.rows[0]?.empty) return;
  logger.info('best_prices.priming');
  await refreshBestPrices();
}
