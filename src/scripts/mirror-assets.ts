import { finish, parseArgs } from './_bootstrap';

/**
 * Optional: mirror card artwork to local disk.
 *
 * By default this application does **not** host card images. It stores the
 * provider's asset base URL and renders `{base}/{quality}.{ext}` straight from
 * `assets.tcgdex.net`. That is the right default: it costs zero storage, zero
 * bandwidth, stays current when artwork is re-scanned, and it does not
 * redistribute artwork we have no licence to redistribute.
 *
 * You would run this script only when you need the instance to be genuinely
 * self-contained - an air-gapped network, an offline binder at a tournament, or
 * a deployment that cannot reach the public internet.
 *
 * Storage, measured against the live CDN:
 *
 *   low.webp   ~15 KB each   ~24,000 cards  =>  ~360 MB
 *   high.png   ~330 KB each  ~24,000 cards  =>  ~8 GB
 *
 * So `--quality low` is almost always what you want; `high` is for print-grade
 * detail views and costs twenty times as much.
 *
 *   npm run mirror:assets                       low quality, all cards
 *   npm run mirror:assets -- --quality high
 *   npm run mirror:assets -- --set swsh3
 *   npm run mirror:assets -- --out ./public/cards
 *   npm run mirror:assets -- --concurrency 12
 *
 * Afterwards set ASSET_BASE_URL to the public path the files are served from
 * (for example `/cards`) and the UI will resolve images locally.
 *
 * Re-running skips files already on disk, so an interrupted mirror resumes.
 */
async function main() {
  const args = parseArgs();
  const { mkdir, writeFile, access } = await import('node:fs/promises');
  const { dirname, join, resolve } = await import('node:path');
  const { sql } = await import('drizzle-orm');
  const { db } = await import('@/db');
  const { logger } = await import('@/lib/logger');
  const { mapWithConcurrency } = await import('@/lib/http');

  const quality = args.quality === 'high' ? 'high' : 'low';
  const extension = quality === 'high' ? 'png' : 'webp';
  const outDir = resolve(String(args.out ?? './public/cards'));
  const concurrency = Number(args.concurrency ?? 8);
  const setFilter = typeof args.set === 'string' ? args.set : null;

  const rows = await db.execute<{ card_id: string; url: string; language: string }>(sql`
    select c.id as card_id, c.image_base_url as url, 'en' as language
    from card c
    where c.image_base_url is not null
      ${setFilter ? sql`and c.set_id = ${setFilter}` : sql``}
    union all
    select ct.card_id, ct.image_base_url as url, ct.language::text as language
    from card_translation ct
    join card c on c.id = ct.card_id
    where ct.image_base_url is not null
      ${setFilter ? sql`and c.set_id = ${setFilter}` : sql``}
  `);

  const targets = rows.rows;
  logger.info('mirror.start', {
    images: targets.length,
    quality,
    outDir,
    estimatedMb: Math.round((targets.length * (quality === 'high' ? 330 : 15)) / 1024),
  });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  const results = await mapWithConcurrency(targets, concurrency, async (row) => {
    // Mirrors the CDN layout so the mapping back to a URL is obvious on disk.
    const relative = join(row.language, `${row.card_id}.${extension}`);
    const destination = join(outDir, relative);

    try {
      await access(destination);
      skipped += 1;
      return relative;
    } catch {
      // Not present yet: download it.
    }

    const response = await fetch(`${row.url}/${quality}.${extension}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
    downloaded += 1;

    if (downloaded % 500 === 0) {
      logger.info('mirror.progress', { downloaded, skipped, failed, of: targets.length });
    }
    return relative;
  });

  for (const result of results) {
    if (!result.ok) failed += 1;
  }

  logger.info('mirror.done', { downloaded, skipped, failed, total: targets.length });
  await finish(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await finish(1);
});
