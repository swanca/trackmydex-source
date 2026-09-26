import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCurrentUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { LANGUAGE_LABELS, LOCALE_DEFAULT_CARD_LANGUAGE, toUiLocale } from '@/lib/catalog/languages';
import { localizedAlternates } from '@/lib/seo';
import { setLogo } from '@/lib/images';
import { formatMoney } from '@/lib/pricing/money';
import { CARD_LANGUAGES, type CardLanguage } from '@/db/schema/enums';
import { getSetDetail, listCards, listSetRarities } from '@/server/services/catalog';
import { SetCardFilters } from '@/components/sets/SetCardFilters';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { SetMark } from '@/components/sets/SetMark';
import { Badge } from '@/components/ui/Badge';
import { CountReadout, Progress } from '@/components/ui/Progress';
import { EmptyState } from '@/components/ui/States';
import { Stat } from '@/components/ui/Surface';
import { CardTile } from '@/components/cards/CardTile';
import { SetFilterBar } from '@/components/sets/SetFilterBar';
import { SetCardSearch } from '@/components/sets/SetCardSearch';
import { Pagination } from '@/components/ui/Pagination';
import { formatDate } from '@/lib/dates';
import { parentSetId } from '@/lib/catalog/subsets';
import { redirect } from '@/i18n/routing';

const PAGE_SIZE = 60;

type SearchParams = Promise<{
  own?: string;
  lang?: string;
  page?: string;
  sort?: string;
  rarity?: string;
  /** Free text, matched against this set's cards only. */
  q?: string;
}>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; setId: string }>;
}): Promise<Metadata> {
  const { locale, setId } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const detail = await getSetDetail(decodeURIComponent(setId), null, 'EUR', LOCALE_DEFAULT_CARD_LANGUAGE[toUiLocale(locale)]);
  if (!detail) return {};

  return {
    title: t('setTitle', { set: detail.name }),
    description: t('setDescription', {
      set: detail.name,
      count: detail.cardCountTotal,
      date: detail.releaseDate ?? '',
    }),
    alternates: localizedAlternates(locale, `/sets/${encodeURIComponent(setId)}`),
    openGraph: {
      images: detail.logoUrl ? [{ url: `${detail.logoUrl}.png` }] : [],
    },
  };
}

/**
 * Set page.
 *
 * The header answers "how far am I" before the grid answers "what is missing".
 * Cards are paginated at 60 per request: enough to fill a phone screen several
 * times over, far short of loading a 400-card set into the DOM.
 */
export default async function SetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; setId: string }>;
  searchParams: SearchParams;
}) {
  const { locale, setId: rawSetId } = await params;
  const setId = decodeURIComponent(rawSetId);
  setRequestLocale(locale);

  /**
   * A subset is not a destination.
   *
   * Its cards live on the parent's page now, so an old link, a bookmark or
   * a search engine landing on /sets/swsh11tg should arrive at Lost Origin
   * rather than on a near-duplicate page listing thirty of its cards.
   */
  const parent = parentSetId(decodeURIComponent(rawSetId));
  if (parent) redirect({ href: `/sets/${parent}`, locale });

  const search = await searchParams;
  const t = await getTranslations();
  const user = await getCurrentUser();
  const prefs = resolvePreferences(user, locale);

  const cardLanguage: CardLanguage = (CARD_LANGUAGES as readonly string[]).includes(
    search.lang ?? '',
  )
    ? (search.lang as CardLanguage)
    : prefs.cardLanguage;

  const ownership =
    search.own === 'owned' || search.own === 'missing' ? search.own : ('all' as const);
  const page = Math.max(1, Number.parseInt(search.page ?? '1', 10) || 1);

  const detail = await getSetDetail(setId, user?.id ?? null, prefs.displayCurrency, cardLanguage);
  if (!detail) notFound();

  const sort = (['number', 'name', 'price'] as const).includes(search.sort as never)
    ? (search.sort as 'number' | 'name' | 'price')
    : 'number';

  const [{ cards, total }, rarities] = await Promise.all([
    listCards({
      setId,
      userId: user?.id ?? null,
      cardLanguage,
      displayCurrency: prefs.displayCurrency,
      ownership,
      ...(search.rarity ? { rarity: [search.rarity] } : {}),
      ...(search.q?.trim() ? { search: search.q.trim() } : {}),
      sort,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listSetRarities(setId),
  ]);

  const uiLocale = toUiLocale(locale);
  const languageLabels = LANGUAGE_LABELS[uiLocale];
  const printedIn = detail.languages.length > 0 ? detail.languages : (['en'] as CardLanguage[]);
  const logo = setLogo(detail.logoUrl);
  const secretCount = Math.max(detail.cardCountTotal - detail.cardCountOfficial, 0);

  return (
    <>
      <PageHeader
        backHref="/sets"
        backLabel={t('set.backToSets')}
        eyebrow={detail.seriesName}
        title={detail.localizedName}
      />

      <PageSection className="space-y-6">
        <section className="surface relative overflow-hidden rounded-[var(--radius-card)] p-5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_120%_at_100%_0%,rgb(59_130_246/0.1),transparent_58%)]"
          />
          <div className="relative flex items-start gap-4">
            {/* Never nothing: 242 of 388 sets have no logo upstream, and an
                empty space here is what made the page look broken. */}
            <div className="size-[76px] shrink-0">
              <SetMark
                logoUrl={logo}
                symbolUrl={detail.symbolUrl}
                code={detail.code}
                setId={detail.id}
                name={detail.localizedName}
                className="drop-shadow-[0_4px_10px_rgb(0_0_0/0.6)]"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="type-eyebrow">{t('set.progress')}</p>
                <CountReadout
                  owned={detail.ownedCount}
                  total={detail.cardCountTotal}
                  className="text-lg"
                />
              </div>
              <Progress
                owned={detail.ownedCount}
                total={detail.cardCountTotal}
                label={t('a11y.progressBar', {
                  owned: detail.ownedCount,
                  total: detail.cardCountTotal,
                })}
                className="mt-2.5"
              />
              <p className="type-meta mt-2 text-xs">
                {t('set.missing', { count: Math.max(detail.cardCountTotal - detail.ownedCount, 0) })}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-hairline pt-4 sm:grid-cols-4">
            {detail.releaseDate ? (
              <Stat
                label={t('sets.releaseDate', { date: '' }).replace('{date}', '').trim() || 'Released'}
                value={formatDate(detail.releaseDate, locale)}
              />
            ) : null}
            <Stat
              label={t('set.totalCards')}
              value={detail.cardCountTotal}
              hint={secretCount > 0 ? t('set.secretCards', { count: secretCount }) : undefined}
            />
            {detail.code ? <Stat label={t('set.setCode')} value={detail.code} /> : null}
            <Stat
              label={t('set.yourValue')}
              value={detail.value ? formatMoney(detail.value, locale, { showDecimals: false }) : '—'}
              tone="accent"
            />
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="type-eyebrow mr-1">{t('set.printedIn')}</span>
            {printedIn.map((language) => (
              <Badge key={language} mono>
                {languageLabels[language]}
              </Badge>
            ))}
            {detail.legalStandard ? <Badge tone="positive">{t('set.standard')}</Badge> : null}
            {!detail.legalStandard && detail.legalExpanded ? (
              <Badge>{t('set.expanded')}</Badge>
            ) : null}
          </div>
        </section>

        <SetFilterBar
          ownership={ownership}
          cardLanguage={cardLanguage}
          availableLanguages={printedIn}
          languageLabels={languageLabels}
          labels={{
            all: t('set.showAll'),
            owned: t('set.showOwnedOnly'),
            missing: t('set.showMissingOnly'),
            language: t('card.language'),
            filters: t('app.filters'),
          }}
        />

        {!printedIn.includes(cardLanguage) ? (
          <p className="type-meta rounded-xl border border-[rgb(245_181_68/0.28)] bg-[rgb(245_181_68/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-amber">
            {t('set.languageNotPrinted', { language: languageLabels[cardLanguage] })}
          </p>
        ) : null}

        {/* Scoped to this set. The global search covers 33,000 cards, which
            is the wrong tool for finding one card in the 250 on screen. */}
        <SetCardSearch total={detail.cardCountTotal} />

        <SetCardFilters rarities={rarities} />

        {cards.length === 0 ? (
          <EmptyState title={t('sets.empty')} body={t('search.noResultsBody')} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {cards.map((card, index) => (
                <CardTile
                  key={card.id}
                  card={card}
                  locale={locale}
                  cardLanguage={cardLanguage}
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
