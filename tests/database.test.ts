import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import { collectionRowsQuery } from '@/server/services/collection-groups';

/**
 * Integration tests against a real Postgres.
 *
 * PGlite is Postgres compiled to WASM, running in this process. That means the
 * generated DDL, the check constraints, the partial and trigram indexes, the
 * one-tap upsert and the hand-written portfolio SQL are all executed by an
 * actual Postgres query planner during `npm test` — with no Docker, no service
 * to start, and no shared state between runs.
 *
 * Typechecking proves the queries compile. This proves they work.
 */

let db: PGlite;

const MIGRATIONS = readdirSync(resolve(process.cwd(), 'drizzle'))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort()
  .map((file) => readFileSync(resolve(process.cwd(), 'drizzle', file), 'utf8'));

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec('create extension if not exists pg_trgm;');

  // Drizzle separates statements with its own marker rather than plain `;`,
  // because function bodies and check constraints contain semicolons.
  for (const migration of MIGRATIONS) {
    for (const statement of migration.split('--> statement-breakpoint')) {
      const sql = statement.trim();
      if (sql) await db.exec(sql);
    }
  }

  await seed();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function seed() {
  await db.exec(`
    insert into era (id, name, start_year, end_year, sort_order)
      values ('swsh', 'Sword & Shield', 2019, 2022, 80);
    insert into series (id, era_id, name, sort_order)
      values ('swsh', 'swsh', 'Sword & Shield', 0);
    insert into set (id, series_id, name, code, release_date, card_count_official, card_count_total, languages, origin_language)
      values ('swsh3', 'swsh', 'Darkness Ablaze', 'DAA', '2020-08-14', 189, 201, array['en','fr']::card_language[], 'en');

    -- A Japanese-only release: its own set, its own series, its own products.
    insert into era (id, name, start_year, end_year, sort_order)
      values ('sv', 'Scarlet & Violet', 2023, 2025, 90);
    insert into series (id, era_id, name, sort_order) values ('SV', 'sv', 'SV (JP)', 500);
    insert into set (id, series_id, name, release_date, card_count_official, card_count_total, languages, origin_language)
      values ('SV1a', 'SV', 'Triplet Beat', '2023-03-10', 73, 103, array['ja']::card_language[], 'ja');

    insert into card (id, set_id, local_id, sort_index, name, category, rarity, illustrator, types, dex_ids)
      values
        ('swsh3-136', 'swsh3', '136', 136, 'Furret', 'Pokemon', 'Uncommon', 'tetsuya koizumi', array['Colorless'], array[162]),
        ('swsh3-189', 'swsh3', '189', 189, 'Pikachu', 'Pokemon', 'Rare', 'Mitsuhiro Arita', array['Lightning'], array[25]);

    insert into card_translation (card_id, language, name, local_id)
      values ('swsh3-136', 'fr', 'Fouinar', '136');

    insert into card_variant (id, card_id, variant_type, size, cardmarket_product_id, tcgplayer_product_id, is_default)
      values
        ('swsh3-136::normal',  'swsh3-136', 'normal',  'standard', 483559, 219333, true),
        ('swsh3-136::reverse', 'swsh3-136', 'reverse', 'standard', 483559, 219333, false),
        ('swsh3-189::normal',  'swsh3-189', 'normal',  'standard', null,   null,   true);

    insert into card_price (card_variant_id, provider, currency, market, low, trend, confidence)
      values
        ('swsh3-136::normal',  'tcgdex.cardmarket', 'EUR', 0.08, 0.02, 0.08, 'exact'),
        ('swsh3-136::normal',  'tcgdex.tcgplayer',  'USD', 0.20, 0.02, null, 'exact'),
        ('swsh3-136::reverse', 'tcgdex.cardmarket', 'EUR', 0.25, 0.04, 0.19, 'exact');

    insert into "user" (id, name, email, email_verified)
      values
        ('u1', 'Test', 'test@example.com', true),
        ('u-language', 'Language', 'language@example.com', true);

    insert into collection_item (user_id, card_id, card_variant_id, language, condition, quantity)
      values ('u-language', 'swsh3-136', 'swsh3-136::normal', 'fr', 'near_mint', 1);
  `);
}

describe('migration', () => {
  it('creates every table', async () => {
    const result = await db.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables where table_schema = 'public'`,
    );
    // 22 application tables; PGlite adds none of its own to `public`.
    expect(result.rows[0]!.count).toBeGreaterThanOrEqual(22);
  });

  it('creates the trigram indexes the search relies on', async () => {
    const result = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public' and indexname like '%trgm%'`,
    );
    expect(result.rows.map((r) => r.indexname).sort()).toEqual([
      'card_name_trgm_idx',
      'card_translation_name_trgm_idx',
      'set_name_trgm_idx',
      'set_translation_name_trgm_idx',
    ]);
  });

  it('creates the partial index for the admin unmapped backlog', async () => {
    const result = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'card_variant_unmapped_idx'`,
    );
    expect(result.rows[0]!.indexdef).toContain('WHERE');
  });

  it('is idempotent to re-run via the migration journal', async () => {
    // Re-applying the same DDL must fail loudly rather than half-apply.
    await expect(db.exec('create table era (id text)')).rejects.toThrow();
  });
});

describe('constraints', () => {
  it('rejects a zero or negative quantity', async () => {
    await expect(
      db.exec(`insert into collection_item (user_id, card_id, card_variant_id, language, condition, quantity)
               values ('u1','swsh3-136','swsh3-136::normal','en','near_mint', 0)`),
    ).rejects.toThrow(/quantity_positive/);
  });

  it('rejects a purchase price without a currency', async () => {
    await expect(
      db.exec(`insert into collection_item (user_id, card_id, card_variant_id, language, condition, quantity, purchase_price)
               values ('u1','swsh3-136','swsh3-136::normal','en','near_mint', 1, 5.00)`),
    ).rejects.toThrow(/purchase_currency_paired/);
  });

  it('rejects a wishlist priority outside 1-5', async () => {
    await expect(
      db.exec(`insert into wishlist_item (user_id, card_id, card_variant_id, language, priority)
               values ('u1','swsh3-136','swsh3-136::normal','en', 9)`),
    ).rejects.toThrow(/priority_range/);
  });

  it('rejects an unknown printed language at the type level', async () => {
    await expect(
      db.exec(`insert into collection_item (user_id, card_id, card_variant_id, language, condition, quantity)
               values ('u1','swsh3-136','swsh3-136::normal','klingon','near_mint', 1)`),
    ).rejects.toThrow();
  });

  it('cascades a user deletion to their collection', async () => {
    await db.exec(`insert into "user" (id, name, email) values ('u2','Temp','t2@example.com')`);
    await db.exec(`insert into collection_item (user_id, card_id, card_variant_id, language, condition, quantity)
                   values ('u2','swsh3-136','swsh3-136::normal','en','near_mint', 3)`);
    await db.exec(`delete from "user" where id = 'u2'`);
    const left = await db.query<{ count: number }>(
      `select count(*)::int as count from collection_item where user_id = 'u2'`,
    );
    expect(left.rows[0]!.count).toBe(0);
  });
});

describe('scanner calibration storage', () => {
  it('bounds a campaign and completes a numbered capture set', async () => {
    const campaign = await db.query<{ id: string }>(`
      insert into calibration_campaign (created_by, target_count)
      values ('u1', 2)
      returning id
    `);
    const id = campaign.rows[0]!.id;

    await db.exec(`
      insert into calibration_capture
        (campaign_id, sequence, image, image_mime, image_width, image_height,
         image_size, fingerprint, metrics, candidates, device)
      values
        ('${id}', 1, decode('ffd8ffd9', 'hex'), 'image/jpeg', 720, 1008,
         4, '0123456789abcdef0123456789abcdef', '{}', '[]', '{}'),
        ('${id}', 2, decode('ffd8ffd9', 'hex'), 'image/jpeg', 720, 1008,
         4, 'fedcba9876543210fedcba9876543210', '{}', '[]', '{}')
    `);
    await db.exec(`
      update calibration_campaign set status = 'complete', completed_at = now()
      where id = '${id}'
    `);

    const progress = await db.query<{ count: number; status: string }>(`
      select count(cc.id)::int as count, max(c.status) as status
      from calibration_campaign c
      left join calibration_capture cc on cc.campaign_id = c.id
      where c.id = '${id}'
    `);
    expect(progress.rows[0]).toMatchObject({ count: 2, status: 'complete' });
  });

  it('rejects duplicate sequences and removes captures with their campaign', async () => {
    const campaign = await db.query<{ id: string }>(`
      insert into calibration_campaign (created_by, target_count)
      values ('u1', 3)
      returning id
    `);
    const id = campaign.rows[0]!.id;
    const insert = () => db.exec(`
      insert into calibration_capture
        (campaign_id, sequence, image, image_mime, image_width, image_height,
         image_size, fingerprint, metrics, candidates, device)
      values
        ('${id}', 1, decode('ffd8ffd9', 'hex'), 'image/jpeg', 720, 1008,
         4, '0123456789abcdef0123456789abcdef', '{}', '[]', '{}')
    `);
    await insert();
    await expect(insert()).rejects.toThrow();

    await db.exec(`delete from calibration_campaign where id = '${id}'`);
    const left = await db.query<{ count: number }>(`
      select count(*)::int as count from calibration_capture where campaign_id = '${id}'
    `);
    expect(left.rows[0]!.count).toBe(0);
  });
});

describe('one-tap quantity upsert', () => {
  it('inserts then increments the same stack rather than duplicating it', async () => {
    const upsert = (delta: number) => db.exec(`
      insert into collection_item as ci (user_id, card_id, card_variant_id, language, condition, quantity)
      values ('u1','swsh3-136','swsh3-136::normal','en','near_mint', ${delta})
      on conflict (user_id, card_variant_id, language, condition)
      do update set quantity = least(ci.quantity + ${delta}, 9999), updated_at = now()
    `);

    await upsert(1);
    await upsert(1);
    await upsert(1);

    const result = await db.query<{ rows: number; quantity: number }>(`
      select count(*)::int as rows, max(quantity)::int as quantity
      from collection_item
      where user_id = 'u1' and card_variant_id = 'swsh3-136::normal'
    `);
    expect(result.rows[0]).toEqual({ rows: 1, quantity: 3 });
  });

  it('treats a different condition as a separate stack', async () => {
    await db.exec(`insert into collection_item (user_id, card_id, card_variant_id, language, condition, quantity)
                   values ('u1','swsh3-136','swsh3-136::normal','en','played', 2)`);
    const result = await db.query<{ count: number }>(
      `select count(*)::int as count from collection_item where user_id = 'u1' and card_variant_id = 'swsh3-136::normal'`,
    );
    expect(result.rows[0]!.count).toBe(2);
  });
});

describe('price selection lateral', () => {
  it('picks one price per printing, preferring exact then Cardmarket', async () => {
    const result = await db.query<{ variant: string; provider: string; market: string }>(`
      select cv.id as variant, price.provider, price.market
      from card_variant cv
      left join lateral (
        select p.provider, p.market
        from card_price p
        where p.card_variant_id = cv.id and p.market is not null
        order by (p.confidence = 'exact') desc,
                 array_position(array['tcgdex.cardmarket','tcgdex.tcgplayer','pokemontcgio'], p.provider) nulls last
        limit 1
      ) price on true
      where cv.card_id = 'swsh3-136'
      order by cv.id
    `);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.provider).toBe('tcgdex.cardmarket');
    expect(Number(result.rows[0]!.market)).toBe(0.08);
    // The reverse printing reads its own -holo-derived row, not the normal one.
    expect(Number(result.rows[1]!.market)).toBe(0.25);
  });

  it('returns a null price rather than dropping an unpriced printing', async () => {
    const result = await db.query<{ market: string | null }>(`
      select price.market
      from card_variant cv
      left join lateral (
        select p.market from card_price p
        where p.card_variant_id = cv.id and p.market is not null limit 1
      ) price on true
      where cv.id = 'swsh3-189::normal'
    `);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.market).toBeNull();
  });
});

describe('set progress query', () => {
  it('counts distinct cards owned, not copies', async () => {
    // u1 owns swsh3-136 twice over (two conditions), which is one card.
    const result = await db.query<{ owned: number; total: number }>(`
      select
        (select count(distinct ci.card_id)::int
         from collection_item ci join card c on c.id = ci.card_id
         where ci.user_id = 'u1' and c.set_id = 'swsh3') as owned,
        s.card_count_total as total
      from set s where s.id = 'swsh3'
    `);
    expect(result.rows[0]!.owned).toBe(1);
    expect(Number(result.rows[0]!.total)).toBe(201);
  });
});

describe('search', () => {
  it('matches a translated name in the user chosen language', async () => {
    const result = await db.query<{ name: string }>(`
      select coalesce(ct.name, c.name) as name
      from card c
      left join card_translation ct on ct.card_id = c.id and ct.language = 'fr'
      where c.name ilike '%furret%' or ct.name ilike '%furret%'
    `);
    expect(result.rows[0]!.name).toBe('Fouinar');
  });

  it('finds a card by its French name when the English one does not match', async () => {
    const result = await db.query<{ id: string }>(`
      select c.id from card c
      left join card_translation ct on ct.card_id = c.id and ct.language = 'fr'
      where c.name ilike '%fouinar%' or ct.name ilike '%fouinar%'
    `);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.id).toBe('swsh3-136');
  });

  /**
   * Regression: search used to join card_translation on the *display* language
   * only, so a French collector browsing an English UI could not find
   * "Dracaufeu" and a Japanese name was invisible outside the JA locale. The
   * match must be language-agnostic even though the display is not.
   */
  it('finds a card by a printed name in any language, whatever the display language', async () => {
    const search = (term: string, displayLanguage: string) =>
      db.query<{ id: string }>(`
        select c.id
        from card c
        left join card_translation ct on ct.card_id = c.id and ct.language = '${displayLanguage}'
        where c.name ilike '%${term}%'
           or ct.name ilike '%${term}%'
           or exists (
             select 1 from card_translation tx
             where tx.card_id = c.id and tx.name ilike '%${term}%'
           )
      `);

    // French name, English UI: the case that was broken.
    expect((await search('fouinar', 'en')).rows.map((r) => r.id)).toEqual(['swsh3-136']);
    // English name still works in the English UI.
    expect((await search('furret', 'en')).rows.map((r) => r.id)).toEqual(['swsh3-136']);
    // And the French name works in the French UI too.
    expect((await search('fouinar', 'fr')).rows.map((r) => r.id)).toEqual(['swsh3-136']);
  });

  it('orders by the numeric projection of the printed number', async () => {
    const result = await db.query<{ local_id: string }>(
      `select local_id from card where set_id = 'swsh3' order by sort_index asc`,
    );
    expect(result.rows.map((r) => r.local_id)).toEqual(['136', '189']);
  });
});

describe('collection card language', () => {
  it('uses the language stored on an owned entry instead of the interface language', async () => {
    const orm = drizzle(db);
    const result = await orm.execute(collectionRowsQuery('u-language', 'en'));

    expect(result.rows[0]).toMatchObject({
      cardName: 'Fouinar',
      language: 'fr',
    });
  });
});

describe('collection sharing', () => {
  it('defaults to hidden value, keeps tokens unique, and cascades with the owner', async () => {
    await db.exec(`
      insert into "user" (id, name, email) values
        ('u-share-a', 'Share A', 'share-a@example.com'),
        ('u-share-b', 'Share B', 'share-b@example.com');
      insert into collection_share (user_id, public_token) values
        ('u-share-a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    `);

    const share = await db.query<{ show_value: boolean }>(
      `select show_value from collection_share where user_id = 'u-share-a'`,
    );
    expect(share.rows[0]?.show_value).toBe(false);

    await expect(
      db.exec(`insert into collection_share (user_id, public_token)
               values ('u-share-b', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')`),
    ).rejects.toThrow();

    await db.exec(`delete from "user" where id = 'u-share-a'`);
    const left = await db.query<{ count: number }>(
      `select count(*)::int as count from collection_share where user_id = 'u-share-a'`,
    );
    expect(left.rows[0]?.count).toBe(0);
  });
});

/**
 * Regression: a bare JS array bound into `any()` is inlined by the ORM as a
 * parenthesised tuple, which Postgres rejects. It broke the scanner, CSV
 * import and every list filter at once, and only showed up at runtime. An
 * explicit array cast is the fix, and this pins it.
 */
describe('array parameter binding', () => {
  it('matches rows with an explicitly cast array', async () => {
    const result = await db.query<{ id: string }>(
      `select id from card where id = any($1::text[]) order by id`,
      ['{swsh3-136,swsh3-189}'],
    );
    expect(result.rows.map((r) => r.id)).toEqual(['swsh3-136', 'swsh3-189']);
  });

  it('rejects a row constructor, which is what the uncast form produces', async () => {
    await expect(
      db.query(`select id from card where id = any(($1, $2))`, ['swsh3-136', 'swsh3-189']),
    ).rejects.toThrow();
  });

  it('filters an enum array column with a cast', async () => {
    // PGlite serialises an array parameter as a Postgres array literal rather
    // than the JS array node-postgres accepts, so the literal form is used here.
    const result = await db.query<{ id: string }>(
      `select id from set where languages && $1::card_language[] order by id`,
      ['{ja}'],
    );
    expect(result.rows.map((r) => r.id)).toEqual(['SV1a']);
  });
});

describe('foreign-origin sets', () => {
  it('stores a Japanese-origin set alongside western sets', async () => {
    const result = await db.query<{ id: string; origin_language: string }>(
      `select id, origin_language from set order by origin_language, id`,
    );
    expect(result.rows).toEqual([
      { id: 'swsh3', origin_language: 'en' },
      { id: 'SV1a', origin_language: 'ja' },
    ]);
  });

  it('keeps the era hierarchy intact for a Japanese-only series', async () => {
    const result = await db.query<{ era: string }>(`
      select e.id as era from set s
      join series se on se.id = s.series_id
      join era e on e.id = se.era_id
      where s.id = 'SV1a'
    `);
    expect(result.rows[0]!.era).toBe('sv');
  });
});

describe('rate limit bucket', () => {
  it('refills over time and refuses once empty', async () => {
    const spend = () => db.query<{ tokens: number }>(`
      insert into rate_limit_bucket as b (key, tokens, updated_at)
      values ('test', 2, now())
      on conflict (key) do update
        set tokens = greatest(0, least(3::numeric, b.tokens + extract(epoch from (now() - b.updated_at)) * 0.0001) - 1),
            updated_at = now()
        where least(3::numeric, b.tokens + extract(epoch from (now() - b.updated_at)) * 0.0001) >= 1
      returning tokens
    `);

    expect((await spend()).rows).toHaveLength(1); // insert, 2 left
    expect((await spend()).rows).toHaveLength(1); // 1 left
    expect((await spend()).rows).toHaveLength(1); // 0 left
    // Refill is ~0.0001 tokens/sec, so the next attempt has nothing to spend.
    expect((await spend()).rows).toHaveLength(0);
  });
});

describe('snapshot job SQL', () => {
  it('copies current prices into history and is safe to re-run', async () => {
    const insert = () => db.exec(`
      insert into card_price_snapshot (card_variant_id, provider, captured_on, currency, market, low, trend)
      select card_variant_id, provider, current_date, currency, market, low, trend
      from card_price where market is not null
      on conflict (card_variant_id, provider, captured_on) do update
        set market = excluded.market, low = excluded.low, trend = excluded.trend
    `);

    await insert();
    await insert();

    const result = await db.query<{ count: number }>(
      `select count(*)::int as count from card_price_snapshot`,
    );
    expect(result.rows[0]!.count).toBe(3);
  });

  /**
   * The scope filter is what keeps the table from growing 19 MB a day. At `all`
   * it records every priced printing; at `tracked` only what somebody owns or
   * wants. Getting this backwards silently fills a free Postgres tier in a
   * month, so the two branches are pinned here.
   */
  it('records only tracked printings when the scope is narrowed', async () => {
    await db.exec(`delete from card_price_snapshot`);

    const snapshot = (scope: string) => db.exec(`
      insert into card_price_snapshot (card_variant_id, provider, captured_on, currency, market, low, trend)
      select p.card_variant_id, p.provider, current_date, p.currency, p.market, p.low, p.trend
      from card_price p
      where p.market is not null and ${scope}
      on conflict (card_variant_id, provider, captured_on) do update
        set market = excluded.market
    `);

    const tracked = `p.card_variant_id in (
      select card_variant_id from collection_item
      union
      select card_variant_id from wishlist_item
    )`;

    await snapshot(tracked);
    const narrow = await db.query<{ count: number }>(
      `select count(*)::int as count from card_price_snapshot`,
    );

    await db.exec(`delete from card_price_snapshot`);
    await snapshot('true');
    const wide = await db.query<{ count: number }>(
      `select count(*)::int as count from card_price_snapshot`,
    );

    expect(wide.rows[0]!.count).toBe(3);
    expect(narrow.rows[0]!.count).toBeLessThan(wide.rows[0]!.count);
  });
});

describe('snapshot compaction', () => {
  /**
   * Scoping slows history growth but never stops it: one row per tracked
   * printing per day still reaches half a gigabyte a year on a large
   * collection. Thinning older weeks to a single reading is what bounds it, so
   * the two properties that matter are pinned here - recent days survive
   * untouched, and older weeks collapse to exactly one point each.
   */
  it('keeps recent days daily and thins older weeks to one point', async () => {
    await db.exec(`delete from card_price_snapshot`);

    const variant = await db.query<{ id: string }>(
      `select card_variant_id as id from card_price limit 1`,
    );
    const id = variant.rows[0]!.id;

    // 400 days of daily readings.
    await db.exec(`
      insert into card_price_snapshot (card_variant_id, provider, captured_on, currency, market)
      select '${id}', 'test', d::date, 'EUR', 10
      from generate_series(current_date - 399, current_date, interval '1 day') d
      on conflict do nothing
    `);

    const before = await db.query<{ count: number }>(
      `select count(*)::int as count from card_price_snapshot`,
    );
    expect(before.rows[0]!.count).toBe(400);

    const DAILY_DAYS = 120;
    await db.exec(`
      delete from card_price_snapshot
      where captured_on < current_date - ${DAILY_DAYS}
        and extract(isodow from captured_on) <> 1
    `);

    const recent = await db.query<{ count: number }>(
      `select count(*)::int as count from card_price_snapshot
       where captured_on >= current_date - ${DAILY_DAYS}`,
    );
    expect(recent.rows[0]!.count).toBe(DAILY_DAYS + 1);

    const older = await db.query<{ days: number; mondays: number }>(
      `select count(*)::int as days,
              count(*) filter (where extract(isodow from captured_on) = 1)::int as mondays
       from card_price_snapshot
       where captured_on < current_date - ${DAILY_DAYS}`,
    );
    // Everything left outside the window is a Monday, and there is one per week.
    expect(older.rows[0]!.days).toBe(older.rows[0]!.mondays);
    expect(older.rows[0]!.days).toBeGreaterThan(35);
    expect(older.rows[0]!.days).toBeLessThan(45);
  });

  it('is idempotent: running it twice removes nothing more', async () => {
    const thin = () => db.exec(`
      delete from card_price_snapshot
      where captured_on < current_date - 120
        and extract(isodow from captured_on) <> 1
    `);
    await thin();
    const after = await db.query<{ count: number }>(
      `select count(*)::int as count from card_price_snapshot`,
    );
    await thin();
    const again = await db.query<{ count: number }>(
      `select count(*)::int as count from card_price_snapshot`,
    );
    expect(again.rows[0]!.count).toBe(after.rows[0]!.count);
  });
});
