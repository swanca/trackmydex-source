import { finish, parseArgs } from './_bootstrap';

/**
 * Builds the artwork fingerprint index that photo recognition matches against.
 *
 *   npm run scan:index                 hash every card missing a fingerprint
 *   npm run scan:index -- --set base1  one set
 *   npm run scan:index -- --force      re-hash everything
 *   npm run scan:index -- --concurrency 12
 *
 * Downloads the low-quality WebP (~15 kB) for each card, computes the 128-bit
 * fingerprint, stores it, and discards the bytes. Nothing is written to disk:
 * the point is the hash, not the picture.
 *
 * Roughly 36,000 downloads on a full catalogue, ~15 minutes at the default
 * concurrency. Resumable - re-running only picks up cards without a hash, so an
 * interrupted run costs nothing.
 */
async function main() {
  const args = parseArgs();
  const sharp = (await import('sharp')).default;
  const { sql } = await import('drizzle-orm');
  const { db } = await import('@/db');
  const { logger } = await import('@/lib/logger');
  const { mapWithConcurrency } = await import('@/lib/http');
  const { fingerprint } = await import('@/lib/scan/phash');

  const concurrency = Number(args.concurrency ?? 8);
  const force = Boolean(args.force);
  const setId = typeof args.set === 'string' ? args.set : null;

  const targets = await db.execute<{ id: string; image_base_url: string }>(sql`
    select id, image_base_url
    from card
    where image_base_url is not null
      ${force ? sql`` : sql`and image_phash is null`}
      ${setId ? sql`and set_id = ${setId}` : sql``}
    order by id
  `);

  const rows = targets.rows;
  logger.info('scan-index.start', { cards: rows.length, concurrency, force, set: setId ?? 'all' });
  if (rows.length === 0) {
    logger.info('scan-index.nothing_to_do');
    await finish(0);
  }

  let hashed = 0;
  let failed = 0;
  const pending: Array<{ id: string; hash: string; source: string }> = [];

  async function flush() {
    if (pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    // One statement per batch rather than per card: 36,000 round trips would
    // dominate the runtime otherwise.
    await db.execute(sql`
      update card as c
      set image_phash = v.hash, image_phash_source = v.source
      from (values ${sql.join(
        batch.map((row) => sql`(${row.id}, ${row.hash}, ${row.source})`),
        sql`, `,
      )}) as v(id, hash, source)
      where c.id = v.id
    `);
  }

  const results = await mapWithConcurrency(rows, concurrency, async (row) => {
    const source = `${row.image_base_url}/low.webp`;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    // `raw()` gives us the exact RGBA the hash function expects, with no
    // re-encoding step that could shift pixel values.
    const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const hash = fingerprint({
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
    });

    pending.push({ id: row.id, hash, source });
    hashed += 1;

    if (pending.length >= 500) await flush();
    if (hashed % 2_000 === 0) {
      logger.info('scan-index.progress', { hashed, failed, of: rows.length });
    }
    return hash;
  });

  await flush();
  for (const result of results) if (!result.ok) failed += 1;

  const coverage = await db.execute<{ total: number; hashed: number }>(sql`
    select count(*)::int as total,
           count(image_phash)::int as hashed
    from card where image_base_url is not null
  `);

  logger.info('scan-index.done', {
    hashed,
    failed,
    coverage: coverage.rows[0],
  });
  await finish(failed > rows.length / 2 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await finish(1);
});
