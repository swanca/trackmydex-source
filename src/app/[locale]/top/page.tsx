import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCurrentUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { listRarities, searchCards } from '@/server/services/search';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/States';
import { CardTile } from '@/components/cards/CardTile';
import { TopCardFilters } from '@/components/cards/TopCardFilters';
import { Pagination } from '@/components/ui/Pagination';

const PAGE_SIZE = 60;

/** Floors offered by the filter bar. Anything else in the URL is ignored. */
const FLOORS = [10, 50, 100, 500] as const;
const DEFAULT_FLOOR = 50;

type SearchParams = Promise<{
  min?: string;
  rarity?: string;
  own?: string;
  page?: string;
}>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'top' });
  return { title: t('title'), description: t('description') };
}

/**
 * The most valuable cards, in order.
 *
 * "See all" on the home page's most-valuable rail used to open an empty
 * search box, which answers a question nobody asked: the rail already told
 * you these are the expensive ones, and the obvious next step is to see the
 * rest of them, not to type.
 *
 * It is a floored list rather than an endless one. Thirty-three thousand
 * cards sorted by price is not something anybody reads to the end, so it
 * stops where the money does - by default at 50, adjustable.
 */
export default async function TopCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;

  const t = await getTranslations();
  const user = await getCurrentUser();
  const prefs = resolvePreferences(user, locale);

  const requested = Number.parseInt(search.min ?? '', 10);
  const floor = (FLOORS as readonly number[]).includes(requested) ? requested : DEFAULT_FLOOR;
  const ownership =
    search.own === 'owned' || search.own === 'missing' ? search.own : ('all' as const);
  const page = Math.max(1, Number.parseInt(search.page ?? '1', 10) || 1);

  const [{ hits, total }, rarities] = await Promise.all([
    searchCards({
      // No text: this is a browse, and the ranking is the price.
      query: '',
      userId: user?.id ?? null,
      cardLanguage: prefs.displayLanguage,
      displayCurrency: prefs.displayCurrency,
      sort: 'price',
      minPrice: floor,
      ownership,
      ...(search.rarity ? { rarity: [search.rarity] } : {}),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listRarities(),
  ]);

  return (
    <>
      <PageHeader
        backHref="/"
        backLabel={t('nav.home')}
        eyebrow={t('top.eyebrow', { count: total })}
        title={t('top.title')}
      />

      <PageSection className="space-y-4 pb-10">
        <TopCardFilters rarities={rarities} currency={prefs.displayCurrency} />

        {hits.length === 0 ? (
          <EmptyState title={t('top.empty')} body={t('top.emptyBody')} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {hits.map((hit, index) => (
                <CardTile
                  key={hit.id}
                  card={{
                    id: hit.id,
                    localId: hit.localId,
                    name: hit.name,
                    imageBaseUrl: hit.imageBaseUrl,
                    rarity: hit.rarity,
                    quantity: hit.quantity,
                    wishlisted: hit.wishlisted,
                    variants: hit.variants,
                    defaultVariantId: hit.defaultVariantId,
                    price: hit.price,
                    priceConfidence: hit.priceConfidence,
                  }}
                  locale={locale}
                  cardLanguage={prefs.displayLanguage}
                  priority={index < 6}
                />
              ))}
            </div>

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              labels={{ previous: t('app.back'), next: t('app.loadMore') }}
            />
          </>
        )}
      </PageSection>
    </>
  );
}
