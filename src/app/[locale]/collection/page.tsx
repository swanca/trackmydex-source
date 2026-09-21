import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { formatMoney, formatNumber } from '@/lib/pricing/money';
import { getPortfolioSummary } from '@/server/services/portfolio';
import { listOwnedSealed } from '@/server/services/sealed';
import { getFxRates } from '@/server/services/fx';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { OwnedSealedList } from '@/components/sealed/OwnedSealedList';
import { SetGroup } from '@/components/collection/SetGroup';
import { listCollectionBySet } from '@/server/services/collection-groups';
import { SearchLauncher } from '@/components/search/SearchLauncher';

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const user = await requireUser(locale, '/collection');
  const prefs = resolvePreferences(user, locale);
  const [summary, sealed, grouped, rates] = await Promise.all([
    getPortfolioSummary(user.id, prefs.displayCurrency),
    listOwnedSealed(user.id, { sort: 'value', limit: 100, language: prefs.displayLanguage }),
    listCollectionBySet(user.id, prefs.displayLanguage, prefs.displayCurrency),
    getFxRates(),
  ]);

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
            <p className="type-eyebrow mb-1">{t('collection.totalValue')}</p>
            <p className="tnum font-display text-xl font-bold">
              {formatMoney(summary.totalValue, locale)}
            </p>
          </div>
          <p className="type-meta max-w-[24ch] text-right text-[0.6875rem]">
            {t('home.totalValueNote')}
          </p>
        </div>

        <div className="space-y-2">
            {grouped.main.map((group, index) => (
              <SetGroup
                key={group.setId}
                group={group}
                locale={locale}
                cardLanguage={prefs.cardLanguage}
                labels={{
                  ownedOfSet: t('collection.ownedOfSet', { owned: group.uniqueCards, total: group.setSize || group.uniqueCards }),
                  copies: group.totalCards > group.uniqueCards ? t('collection.copies', { count: group.totalCards }) : undefined,
                  all: t('set.showAll'), owned: t('set.showOwnedOnly'), missing: t('set.showMissingOnly'),
                  sort: t('sets.sortBy'), sortNumber: t('collection.sortNumber'),
                  sortPriceAscending: t('collection.sortPriceAscending'), sortPriceDescending: t('collection.sortPriceDescending'),
                  add: t('collection.increment'), remove: t('collection.decrement'), quantity: t('card.quantity'),
                  loading: t('app.loading'), error: t('app.error'), empty: t('sets.empty'),
                }}
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
                    <SetGroup
                      key={group.setId}
                      group={group}
                      locale={locale}
                      cardLanguage={prefs.cardLanguage}
                      labels={{
                        ownedOfSet: t('collection.ownedOfSet', { owned: group.uniqueCards, total: group.setSize || group.uniqueCards }),
                        copies: group.totalCards > group.uniqueCards ? t('collection.copies', { count: group.totalCards }) : undefined,
                        all: t('set.showAll'), owned: t('set.showOwnedOnly'), missing: t('set.showMissingOnly'),
                        sort: t('sets.sortBy'), sortNumber: t('collection.sortNumber'),
                        sortPriceAscending: t('collection.sortPriceAscending'), sortPriceDescending: t('collection.sortPriceDescending'),
                        add: t('collection.increment'), remove: t('collection.decrement'), quantity: t('card.quantity'),
                        loading: t('app.loading'), error: t('app.error'), empty: t('sets.empty'),
                      }}
                    />
                  ))}
                </div>
              </details>
            ) : null}
        </div>

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
