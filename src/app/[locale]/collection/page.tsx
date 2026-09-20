import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { LANGUAGE_LABELS, toUiLocale } from '@/lib/catalog/languages';
import { formatMoney, formatNumber } from '@/lib/pricing/money';
import { getCollectionFacets, listCollection } from '@/server/services/collection';
import { getPortfolioSummary } from '@/server/services/portfolio';
import { listOwnedSealed } from '@/server/services/sealed';
import { getFxRates } from '@/server/services/fx';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { CollectionFilters } from '@/components/collection/CollectionFilters';
import { CollectionRow } from '@/components/collection/CollectionRow';
import { OwnedSealedList } from '@/components/sealed/OwnedSealedList';
import { SetGroup } from '@/components/collection/SetGroup';
import { listCollectionBySet } from '@/server/services/collection-groups';
import { SearchLauncher } from '@/components/search/SearchLauncher';

const PAGE_SIZE = 40;

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const user = await requireUser(locale, '/collection');
  const prefs = resolvePreferences(user, locale);
  const search = await searchParams;

  const page = Math.max(1, Number.parseInt(search.page ?? '1', 10) || 1);
  // Any active filter means the collector is looking for something specific,
  // and a flat ranked list answers that better than a set of drawers to open.
  const filtered = Boolean(
    search.lang || search.cond || search.set || search.rarity || search.variant ||
      search.min || search.max,
  );

  const sort = (['value', 'recent', 'name', 'number'] as const).includes(search.sort as never)
    ? (search.sort as 'value' | 'recent' | 'name' | 'number')
    : 'value';

  const [{ rows, total }, facets, summary, sealed, grouped, rates] = await Promise.all([
    listCollection(user.id, prefs.displayLanguage, {
      ...(search.lang ? { language: [search.lang] } : {}),
      ...(search.cond ? { condition: [search.cond] } : {}),
      ...(search.set ? { setId: [search.set] } : {}),
      ...(search.rarity ? { rarity: [search.rarity] } : {}),
      ...(search.variant ? { variantType: [search.variant] } : {}),
      ...(search.min ? { minPrice: Number(search.min) } : {}),
      ...(search.max ? { maxPrice: Number(search.max) } : {}),
      sort,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getCollectionFacets(user.id),
    getPortfolioSummary(user.id, prefs.displayCurrency),
    listOwnedSealed(user.id, { sort, limit: 100, language: prefs.displayLanguage }),
    listCollectionBySet(user.id, prefs.displayLanguage, prefs.displayCurrency),
    getFxRates(),
  ]);

  const uiLocale = toUiLocale(locale);
  const languageLabels = LANGUAGE_LABELS[uiLocale];

  if (summary.totalCards === 0 && sealed.total === 0) {
    return (
      <>
        <PageHeader title={t('collection.title')} />
        <PageSection>
          <EmptyState
            title={t('collection.empty')}
            body={t('collection.emptyBody')}
            action={
              <Link href="/sets">
                <Button>{t('home.emptyCta')}</Button>
              </Link>
            }
          />
        </PageSection>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('collection.title')}
        eyebrow={t('collection.subtitle', {
          unique: formatNumber(summary.uniqueCards, locale),
          total: formatNumber(summary.totalCards, locale),
        })}
        actions={
          <>
            <a href="/api/collection/export" download>
              <Button variant="secondary" size="sm">
                {t('csv.export')}
              </Button>
            </a>
            <Link href="/collection/import">
              <Button variant="ghost" size="sm">
                {t('csv.import')}
              </Button>
            </Link>
          </>
        }
      />

      <PageSection className="space-y-4">
        <SearchLauncher />

        <div className="surface-flat flex items-baseline justify-between gap-4 rounded-[var(--radius-tile)] px-4 py-3">
          <div>
            <p className="type-eyebrow mb-1">{t('portfolio.estimatedValue')}</p>
            <p className="tnum font-display text-xl font-bold">
              {formatMoney(summary.totalValue, locale)}
            </p>
          </div>
          <p className="type-meta max-w-[24ch] text-right text-[0.6875rem]">
            {t('home.totalValueNote')}
          </p>
        </div>

        <CollectionFilters
          facets={{
            languages: facets.languages.map((value) => ({
              value,
              label: languageLabels[value as keyof typeof languageLabels] ?? value,
            })),
            conditions: facets.conditions.map((value) => ({
              value,
              label: t(`condition.${value}` as never),
            })),
            rarities: facets.rarities.map((value) => ({ value, label: value })),
            variants: facets.variants.map((value) => ({
              value,
              label: t(`variant.${value}` as never),
            })),
            sets: facets.sets.map((set) => ({ value: set.id, label: set.name })),
          }}
          labels={{
            filters: t('app.filters'),
            apply: t('app.apply'),
            clear: t('app.clearAll'),
            language: t('collection.filterLanguage'),
            condition: t('collection.filterCondition'),
            set: t('collection.filterSet'),
            rarity: t('collection.filterRarity'),
            variant: t('collection.filterVariant'),
            price: t('collection.filterPrice'),
            sort: t('sets.sortBy'),
            sortValue: t('collection.sortValue'),
            sortRecent: t('collection.sortRecent'),
            sortName: t('collection.sortName'),
            sortNumber: t('collection.sortNumber'),
            all: t('collection.all'),
          }}
        />

        {/* Filters still narrow a flat list; with none applied the collection
            is shown grouped by set, which is how collectors think about it. */}
        {filtered ? (
          rows.length === 0 ? (
            <EmptyState title={t('sets.empty')} body={t('search.noResultsBody')} />
          ) : (
            <>
              <ul className="space-y-2">
                {rows.map((row) => (
                  <CollectionRow
                    key={row.id}
                    row={row}
                    locale={locale}
                    displayCurrency={prefs.displayCurrency}
                    labels={{
                      variant: t(`variant.${row.variantType}` as never),
                      condition: t(`condition.${row.condition}` as never),
                      language:
                        languageLabels[row.language as keyof typeof languageLabels] ?? row.language,
                      increment: t('collection.increment'),
                      decrement: t('collection.decrement'),
                      count: t('collection.quantityLabel', { count: row.quantity }),
                    }}
                  />
                ))}
              </ul>

              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                labels={{ previous: t('app.back'), next: t('app.loadMore') }}
              />
            </>
          )
        ) : (
          <div className="space-y-2">
            {grouped.main.map((group, index) => (
              <SetGroup
                key={group.setId}
                group={group}
                locale={locale}
                defaultOpen={index === 0}
              />
            ))}

            {/* Japanese and other Asian-only releases are their own pursuit,
                with their own numbering. Listed inline they double the page
                and bury the sets being actively worked on. */}
            {grouped.asian.length > 0 ? (
              <details className="surface mt-4 overflow-hidden rounded-[var(--radius-tile)]">
                <summary className="cursor-pointer list-none px-3.5 py-3 text-[0.875rem] font-semibold text-paper">
                  {t('collection.asianSets', { count: grouped.asian.length })}
                </summary>
                <div className="space-y-2 border-t border-hairline p-2">
                  {grouped.asian.map((group) => (
                    <SetGroup key={group.setId} group={group} locale={locale} />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        )}

        {sealed.rows.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 font-display text-base font-bold text-paper">
              {t('sealed.mySealed')}
            </h2>
            <OwnedSealedList
              rows={sealed.rows}
              displayCurrency={prefs.displayCurrency}
              rates={rates}
            />
          </section>
        ) : null}
      </PageSection>
    </>
  );
}
