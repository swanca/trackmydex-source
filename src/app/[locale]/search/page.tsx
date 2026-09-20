import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { setLogo } from '@/lib/images';
import Image from 'next/image';
import { searchCards, searchSets } from '@/server/services/search';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { SearchInput } from '@/components/search/SearchInput';
import { SegmentedControlLinks } from '@/components/search/OwnershipTabs';
import { EmptyState } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { CardTile } from '@/components/cards/CardTile';

const PAGE_SIZE = 40;

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const user = await getCurrentUser();
  const prefs = resolvePreferences(user, locale);
  const search = await searchParams;

  const query = (search.q ?? '').trim();
  const ownership =
    search.own === 'owned' || search.own === 'missing' ? search.own : ('all' as const);
  const page = Math.max(1, Number.parseInt(search.page ?? '1', 10) || 1);

  const [cardResults, setResults] = query
    ? await Promise.all([
        searchCards({
          query,
          userId: user?.id ?? null,
          cardLanguage: prefs.displayLanguage,
          displayCurrency: prefs.displayCurrency,
          ownership,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
        searchSets(query, prefs.displayLanguage, 6),
      ])
    : [{ hits: [], total: 0 }, []];

  return (
    <>
      <PageHeader title={t('search.title')} />

      <PageSection className="space-y-5">
        <SearchInput
          label={t('search.title')}
          placeholder={t('search.placeholder')}
          hint={t('search.hint')}
          autoFocus
        />

        {user && query ? (
          <SegmentedControlLinks
            current={ownership}
            options={[
              { value: 'all', label: t('collection.all') },
              { value: 'owned', label: t('collection.ownedOnly') },
              { value: 'missing', label: t('collection.missingOnly') },
            ]}
            label={t('collection.filterOwnership')}
          />
        ) : null}

        {!query ? null : cardResults.total === 0 && setResults.length === 0 ? (
          <EmptyState title={t('search.noResults', { query })} body={t('search.noResultsBody')} />
        ) : (
          <>
            {setResults.length > 0 ? (
              <section>
                <p className="type-eyebrow mb-2">{t('search.setsTab')}</p>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {setResults.map((set) => {
                    const logo = setLogo(set.logoUrl);
                    return (
                      <li key={set.id}>
                        <Link
                          href={`/sets/${encodeURIComponent(set.id)}`}
                          className="surface-flat flex items-center gap-3 rounded-[var(--radius-tile)] px-3 py-2.5 transition-colors hover:bg-[var(--color-slate-hi)]"
                        >
                          {logo ? (
                            <Image
                              src={logo}
                              alt=""
                              width={36}
                              height={36}
                              className="max-h-9 w-auto shrink-0 object-contain"
                            />
                          ) : null}
                          <span className="min-w-0">
                            <span className="block truncate text-[0.8125rem] font-semibold">
                              {set.name}
                            </span>
                            <span className="type-meta block truncate text-[0.6875rem]">
                              {set.seriesName} · {set.cardCountTotal}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {cardResults.hits.length > 0 ? (
              <section>
                <p className="type-eyebrow mb-2">
                  {t('search.results', { count: cardResults.total })}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {cardResults.hits.map((hit, index) => (
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
                      priority={index < 4}
                    />
                  ))}
                </div>

                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={cardResults.total}
                  labels={{ previous: t('app.back'), next: t('app.loadMore') }}
                  className="mt-4"
                />
              </section>
            ) : null}
          </>
        )}
      </PageSection>
    </>
  );
}
