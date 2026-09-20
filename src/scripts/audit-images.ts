import { finish } from './_bootstrap';

/**
 * Where are the missing card images, and can anything be done about each one?
 *
 *   npm run audit:images
 *
 * Reports every set with cards lacking artwork, and for each says whether a
 * source exists that we are not yet using. The point is to separate "we have
 * not wired this up" from "nobody publishes it", because the two need
 * completely different answers and only the first is a bug.
 */
async function main() {
  const { sql } = await import('drizzle-orm');
  const { db } = await import('@/db');
  const { listGroups, CATEGORIES } = await import('@/providers/sealed/tcgcsv');

  const rows = (
    await db.execute<{
      setId: string;
      setName: string;
      originLanguage: string;
      missing: number;
      total: number;
    }>(sql`
      select
        s.id                                                          as "setId",
        s.name                                                        as "setName",
        s.origin_language                                             as "originLanguage",
        count(*) filter (
          where c.image_base_url is null and c.fallback_image_url is null
        )::int                                                        as missing,
        count(*)::int                                                 as total
      from card c
      join set s on s.id = c.set_id
      group by s.id, s.name, s.origin_language
      having count(*) filter (
        where c.image_base_url is null and c.fallback_image_url is null
      ) > 0
      order by 4 desc
    `)
  ).rows;

  // What TCGplayer knows about, by the two keys we can match on.
  const known = new Map<string, string>();
  for (const category of CATEGORIES) {
    for (const group of await listGroups(category.id)) {
      const abbreviation = group.abbreviation?.trim().toLowerCase();
      if (abbreviation) known.set(`${category.language}:${abbreviation}`, group.name);
      known.set(
        `${category.language}:name:${group.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`,
        group.name,
      );
    }
  }

  let reachable = 0;
  let orphaned = 0;

  console.log('\nset                     langue  manquants/total  source disponible');
  console.log('-'.repeat(78));

  for (const row of rows) {
    const hit =
      known.get(`${row.originLanguage}:${row.setId.toLowerCase()}`) ??
      known.get(
        `${row.originLanguage}:name:${row.setName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`,
      );

    if (hit) reachable += row.missing;
    else orphaned += row.missing;

    console.log(
      `${row.setId.padEnd(22)}  ${row.originLanguage.padEnd(6)}  ` +
        `${String(row.missing).padStart(5)}/${String(row.total).padEnd(5)}    ` +
        (hit ? `TCGplayer: ${hit.slice(0, 30)}` : 'aucune'),
    );
  }

  const totals = (
    await db.execute<{ own: number; fallback: number; missing: number; total: number }>(sql`
      select
        count(*) filter (where image_base_url is not null)::int as own,
        count(*) filter (where image_base_url is null and fallback_image_url is not null)::int as fallback,
        count(*) filter (where image_base_url is null and fallback_image_url is null)::int as missing,
        count(*)::int as total
      from card
    `)
  ).rows[0]!;

  const covered = totals.own + totals.fallback;
  console.log('-'.repeat(78));
  console.log(`visuels du catalogue   : ${totals.own}`);
  console.log(`replis TCGplayer       : ${totals.fallback}`);
  console.log(`manquants              : ${totals.missing}`);
  console.log(
    `couverture             : ${((covered / totals.total) * 100).toFixed(1)}% ` +
      `(${covered}/${totals.total})`,
  );
  console.log(`  dont recuperables    : ${reachable}  (un groupe TCGplayer existe)`);
  console.log(`  dont introuvables    : ${orphaned}  (personne ne les publie)`);

  await finish(0);
}

main().catch(async (error) => {
  console.error(error);
  await finish(1);
});
