import type { MetadataRoute } from 'next';
import { unstable_cache } from 'next/cache';
import { count } from 'drizzle-orm';
import { db } from '@/db';
import { card, set } from '@/db/schema';
import { APP_ORIGIN, sitemapAlternates } from '@/lib/seo';

export const dynamic = 'force-dynamic';

// The catalogue changes nightly at most. Keep generation at request time so
// the Docker build does not need database access, then cache the result for a
// day so crawlers do not re-read 33,000 rows on every request. Next refuses
// cache entries above 2 MB, hence the bounded chunks.
const SITEMAP_CHUNK_SIZE = 5_000;

const loadCardCount = unstable_cache(
  async () => Number((await db.select({ value: count() }).from(card))[0]?.value ?? 0),
  ['public-sitemap-card-count'],
  { revalidate: 86_400 },
);

const loadCardChunk = unstable_cache(
  async (offset: number) =>
    db
      .select({ id: card.id, updatedAt: card.updatedAt })
      .from(card)
      .orderBy(card.id)
      .limit(SITEMAP_CHUNK_SIZE)
      .offset(offset),
  ['public-sitemap-card-chunk'],
  { revalidate: 86_400 },
);

const loadSets = unstable_cache(
  async () => db.select({ id: set.id, updatedAt: set.updatedAt }).from(set).orderBy(set.id),
  ['public-sitemap-sets'],
  { revalidate: 86_400 },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cardCount, sets] = await Promise.all([loadCardCount(), loadSets()]);
  const chunks = await Promise.all(
    Array.from({ length: Math.ceil(cardCount / SITEMAP_CHUNK_SIZE) }, (_, index) =>
      loadCardChunk(index * SITEMAP_CHUNK_SIZE),
    ),
  );
  const cards = chunks.flat();

  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap[number] => ({
    url: `${APP_ORIGIN}/en${path}`,
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages: sitemapAlternates(path) },
  });

  return [
    entry(''),
    entry('/sets'),
    entry('/top'),
    entry('/sealed'),
    entry('/methodology'),
    ...sets.map((item) => entry(`/sets/${encodeURIComponent(item.id)}`, item.updatedAt)),
    ...cards.map((item) => entry(`/cards/${encodeURIComponent(item.id)}`, item.updatedAt)),
  ];
}
