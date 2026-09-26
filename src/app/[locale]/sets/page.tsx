import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCurrentUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { listSetsWithProgress } from '@/server/services/catalog';
import { getPortfolioSummary } from '@/server/services/portfolio';
import { addMoney, type Money } from '@/lib/pricing/money';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/States';
import { EraHeader, SetRow } from '@/components/sets/SetRow';
import { SetSearch } from '@/components/sets/SetSearch';
import { EraDisclosure } from '@/components/sets/EraDisclosure';
import { eraLabel, type EraTranslator } from '@/lib/catalog/eras';
import { FEATURED_SET_IDS, isJapanOnly } from '@/lib/catalog/featured-sets';
import { localizedAlternates } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: t('setsTitle'), description: t('setsDescription'), alternates: localizedAlternates(locale, '/sets') };
}

/**
 * The set browser.
 *
 * Three hundred and eighty-eight extensions laid out in full is a data dump
 * rather than a browser, so the page now leads with the fifteen sets a
 * collector would name and folds the rest into eras that open on demand.
 * Nothing is unreachable: the search above covers all of them and answers
 * as you type.
 *
 * Japanese-only releases are the last group rather than being interleaved.
 * There are 165 of them against 223 western sets, so mixing them doubles the
 * length of every era for the minority of people who collect them.
 *
 * Still rendered on the server: the counts and values never reach the
 * browser as data, only as markup.
 */
export default async function SetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const user = await getCurrentUser();
  const prefs = resolvePreferences(user, locale);

  const [{ eras, sets }, summary] = await Promise.all([
    listSetsWithProgress(user?.id ?? null, prefs.displayCurrency, {
      translateTo: prefs.displayLanguage,
    }),
    user ? getPortfolioSummary(user.id, prefs.displayCurrency) : Promise.resolve(null),
  ]);

  if (sets.length === 0) {
    return (
      <>
        <PageHeader title={t('sets.title')} />
        <PageSection>
          <EmptyState title={t('sets.notSynced')} body={t('sets.notSyncedBody')} />
        </PageSection>
      </>
    );
  }

  // The fan in each era band shows the user's own best cards from that era, so
  // the header is a snapshot of their collection rather than stock artwork.
  const fanByEra = new Map<string, Array<{ url: string | null; alt: string }>>();
  if (summary) {
    for (const card of summary.topCards) {
      const setNode = sets.find((s) => s.id === card.setId);
      if (!setNode) continue;
      const existing = fanByEra.get(setNode.eraId) ?? [];
      if (existing.length >= 3) continue;
      existing.push({ url: card.imageBaseUrl, alt: card.name });
      fanByEra.set(setNode.eraId, existing);
    }
  }

  // Era names are ours rather than the provider's, so they are translated
  // here; resolved once instead of per set row.
  const eraNames = new Map(
    eras.map((era) => [era.id, eraLabel(t as EraTranslator, era.id, era.name)]),
  );

  const rowLabels = (owned: number, total: number, releaseDate: string | null) => ({
    progress: t('a11y.progressBar', { owned, total }),
    release: t('sets.releaseDate', { date: releaseDate ?? '' }),
    value: t('sets.valueOwned'),
  });

  // Curated by hand, ordered by date: an id that no longer resolves is
  // dropped rather than leaving a hole, so a retired set cannot break the page.
  const byId = new Map(sets.map((set) => [set.id, set]));
  const featured = FEATURED_SET_IDS.map((id) => byId.get(id))
    .filter((set) => set !== undefined)
    .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));

  const western = sets.filter((set) => !isJapanOnly(set.languages));
  const japanese = sets.filter((set) => isJapanOnly(set.languages));

  // Promos are a catch-all, not a period. Sorted by recency they lead the
  // list - 184 sets spanning 1999 to today, sitting above the era somebody is
  // actually collecting - so they go last, just before the Japanese releases.
  const orderedEras = [
    ...eras.filter((era) => era.id !== 'special'),
    ...eras.filter((era) => era.id === 'special'),
  ];

  /**
   * Totals for the rows a group actually contains.
   *
   * The era aggregates from the query count every set in the era, Japanese
   * releases included - and those now live in their own group at the bottom.
   * Left as they were, an era bar could never reach the end of its own list.
   */
  const totalsFor = (group: typeof sets) => ({
    owned: group.reduce((sum, set) => sum + set.ownedCount, 0),
    total: group.reduce((sum, set) => sum + set.cardCountTotal, 0),
    value: group.reduce<Money | null>(
      (sum, set) =>
        set.value === null ? sum : sum === null ? set.value : addMoney(sum, set.value),
      null,
    ),
  });

  const japanTotals = totalsFor(japanese);

  return (
    <>
      <PageHeader
        title={t('sets.title')}
        eyebrow={t('sets.subtitle', { count: sets.length, eras: eras.length })}
      />

      <PageSection>
        <SetSearch
          sets={sets.map((set) => ({
            id: set.id,
            name: set.name,
            code: set.code ?? null,
            logoUrl: set.logoUrl ?? null,
            releaseDate: set.releaseDate ?? null,
            cardCount: set.cardCountTotal,
            ownedCount: set.ownedCount,
            eraName: eraNames.get(set.eraId) ?? '',
          }))}
        >
          <div className="space-y-8">
            {featured.length > 0 ? (
              <section className="space-y-3">
                <div className="space-y-1">
                  <h2 className="type-title">{t('sets.featured')}</h2>
                  <p className="type-meta text-[0.8125rem]">{t('sets.featuredHint')}</p>
                </div>
                <ul className="space-y-2">
                  {featured.map((set) => (
                    <SetRow
                      key={set.id}
                      set={set}
                      locale={locale}
                      labels={rowLabels(set.ownedCount, set.cardCountTotal, set.releaseDate)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-3">
              <h2 className="type-title">{t('sets.browseAll')}</h2>

              {orderedEras.map((era) => {
                const eraSets = western.filter((set) => set.eraId === era.id);
                if (eraSets.length === 0) return null;
                const totals = totalsFor(eraSets);

                return (
                  <EraDisclosure
                    key={era.id}
                    count={eraSets.length}
                    countLabel={t('sets.setCount', { count: eraSets.length })}
                    header={
                      <EraHeader
                        name={eraNames.get(era.id) ?? era.name}
                        years={
                          era.endYear ? `${era.startYear}–${era.endYear}` : `${era.startYear}–`
                        }
                        owned={totals.owned}
                        total={totals.total}
                        value={totals.value}
                        locale={locale}
                        fan={fanByEra.get(era.id) ?? []}
                        progressLabel={t('a11y.progressBar', {
                          owned: totals.owned,
                          total: totals.total,
                        })}
                      />
                    }
                  >
                    <ul className="space-y-2">
                      {eraSets.map((set) => (
                        <SetRow
                          key={set.id}
                          set={set}
                          locale={locale}
                          labels={rowLabels(set.ownedCount, set.cardCountTotal, set.releaseDate)}
                        />
                      ))}
                    </ul>
                  </EraDisclosure>
                );
              })}

              {japanese.length > 0 ? (
                <EraDisclosure
                  count={japanese.length}
                  countLabel={t('sets.setCount', { count: japanese.length })}
                  header={
                    <EraHeader
                      name={t('sets.japanOnly')}
                      years={t('sets.japanOnlyHint')}
                      owned={japanTotals.owned}
                      total={japanTotals.total}
                      value={japanTotals.value}
                      locale={locale}
                      fan={[]}
                      progressLabel={t('a11y.progressBar', {
                        owned: japanTotals.owned,
                        total: japanTotals.total,
                      })}
                    />
                  }
                >
                  <ul className="space-y-2">
                    {japanese.map((set) => (
                      <SetRow
                        key={set.id}
                        set={set}
                        locale={locale}
                        labels={rowLabels(set.ownedCount, set.cardCountTotal, set.releaseDate)}
                      />
                    ))}
                  </ul>
                </EraDisclosure>
              ) : null}
            </section>
          </div>
        </SetSearch>
      </PageSection>
    </>
  );
}
