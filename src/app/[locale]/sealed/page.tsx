import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCurrentUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { browseSealed, getSealedFacets } from '@/server/services/sealed';
import { getFxRates } from '@/server/services/fx';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { SealedTile } from '@/components/sealed/SealedTile';
import { SealedFilters } from '@/components/sealed/SealedFilters';
import { localizedAlternates } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('sealedTitle'), description: t('sealedDescription'), alternates: localizedAlternates(locale, '/sealed') };
}

const PAGE_SIZE = 48;

/**
 * Sealed product browser.
 *
 * Boxes, packs, Elite Trainer Boxes, bundles, tins, blisters and cases, across
 * both the western and Japanese catalogues. Rendered on the server: 7,500
 * products and the viewer's owned counts never cross the wire as data.
 */
export default async function SealedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  const t = await getTranslations();
  const user = await getCurrentUser();
  const prefs = resolvePreferences(user, locale);

  const one = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const many = (key: string) => {
    const value = one(key);
    return value ? value.split(',').filter(Boolean) : [];
  };

  const page = Math.max(1, Number(one('page') ?? 1) || 1);
  const sort = (one('sort') ?? 'value') as 'value' | 'recent' | 'name';

  const [{ rows, total }, facets, rates] = await Promise.all([
    browseSealed(user?.id ?? null, {
      language_: prefs.displayLanguage,
      ...(one('q') ? { search: one('q') as string } : {}),
      ...(many('kind').length ? { kind: many('kind') } : {}),
      ...(many('lang').length ? { language: many('lang') } : {}),
      ...(one('set') ? { setId: one('set') as string } : {}),
      sort,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getSealedFacets(),
    getFxRates(),
  ]);

  return (
    <>
      <PageHeader title={t('sealed.title')} eyebrow={t('sealed.subtitle', { count: total })} />

      <PageSection>
        <SealedFilters
          kinds={facets.kinds.map((k) => ({
            value: k.value,
            label: `${t(`sealed.kind.${k.value}`)} (${k.count})`,
          }))}
          languages={facets.languages.map((l) => ({
            value: l.value,
            label: `${l.value.toUpperCase()} (${l.count})`,
          }))}
        />

        {rows.length === 0 ? (
          <EmptyState title={t('sealed.emptyTitle')} body={t('sealed.emptyBody')} />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {rows.map((product) => (
                <SealedTile
                  key={product.id}
                  product={product}
                  displayCurrency={prefs.displayCurrency}
                  rates={rates}
                  signedIn={Boolean(user)}
                />
              ))}
            </div>

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              labels={{ previous: t('app.back'), next: t('app.loadMore') }}
              className="mt-6"
            />
          </>
        )}
      </PageSection>
    </>
  );
}
