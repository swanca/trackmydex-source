import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { formatMoney, formatNumber } from '@/lib/pricing/money';
import { LANGUAGE_LABELS, toUiLocale } from '@/lib/catalog/languages';
import {
  getPortfolioHistory,
  getPortfolioSummary,
  type PortfolioSummary,
} from '@/server/services/portfolio';
import { isCatalogReady, listRecentSets, listSetsInProgress } from '@/server/services/catalog';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { SectionHeader, Stat, Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { Progress } from '@/components/ui/Progress';
import { Breakdown } from '@/components/dashboard/Breakdown';
import { ValueChart } from '@/components/dashboard/ValueChart';
import { CardRailItem } from '@/components/cards/CardTile';
import { SetRow } from '@/components/sets/SetRow';
import { SearchLauncher } from '@/components/search/SearchLauncher';
import { FeaturedRail } from '@/components/home/FeaturedRail';
import { getFeaturedRails } from '@/server/services/featured';
import type { Currency } from '@/db/schema/enums';
import { APP_ORIGIN, localizedAlternates } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: localizedAlternates(locale) };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const user = await getCurrentUser();
  const prefs = resolvePreferences(user, locale);
  const catalogReady = await isCatalogReady();

  if (!user) {
    return (
      <SignedOutHome
        locale={locale}
        catalogReady={catalogReady}
        cardLanguage={prefs.displayLanguage}
        displayCurrency={prefs.displayCurrency}
      />
    );
  }

  const [summary, history, inProgress, recentSets, rails] = await Promise.all([
    getPortfolioSummary(user.id, prefs.displayCurrency),
    getPortfolioHistory(user.id, 90),
    listSetsInProgress(user.id, prefs.displayLanguage),
    listRecentSets(user.id, prefs.displayLanguage, 5),
    getFeaturedRails(prefs.displayLanguage, prefs.displayCurrency),
  ]);

  const empty = summary.totalCards === 0;

  return (
    <>
      <PageHeader
        eyebrow={t('home.greeting')}
        title={t('home.greetingNamed', { name: firstName(user.name) })}
      />

      <PageSection className="space-y-8">
        {/* The headline number. Everything else on this page is context for it. */}
        <Surface className="relative overflow-hidden p-5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_130%_at_0%_0%,rgb(139_92_246/0.14),transparent_60%)]"
          />
          <div className="relative">
            <p className="type-eyebrow">{t('home.totalValue')}</p>
            <p className="type-hero accent-gradient tnum mt-1.5">
              {formatMoney(summary.totalValue, locale, {
                compact: summary.totalValue.minor > 10_000_000,
              })}
            </p>
            <p className="type-meta mt-2 text-xs">{t('home.totalValueNote')}</p>

            <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-hairline pt-4">
              <Stat label={t('home.cardsOwned')} value={formatNumber(summary.totalCards, locale)} />
              <Stat label={t('home.uniqueCards')} value={formatNumber(summary.uniqueCards, locale)} />
              <Stat label={t('home.setsStarted')} value={formatNumber(summary.setsStarted, locale)} />
            </dl>

            {summary.totalSpend.minor > 0 ? (
              <GainRow summary={summary} locale={locale} labels={{ gain: t('home.gain'), loss: t('home.loss'), spend: t('home.spend') }} />
            ) : null}
          </div>
        </Surface>

        {empty ? (
          <EmptyState
            title={t('home.emptyTitle')}
            body={t('home.emptyBody')}
            action={
              <Link href="/sets">
                <Button>{t('home.emptyCta')}</Button>
              </Link>
            }
          />
        ) : null}

        {/* Cards with prices, whether or not the collection has anything in
            it yet. An empty dashboard tells a newcomer nothing about what
            this is; a shelf of Charizards does. */}
        {rails.map((rail) => (
          <FeaturedRail key={rail.href} rail={rail} locale={locale} />
        ))}

        {!empty ? (
          <>

            {summary.recentlyAdded.length > 0 ? (
              <section>
                <SectionHeader title={t('home.recentlyAdded')} />
                <div className="snap-row no-scrollbar -mx-5 px-5 lg:-mx-8 lg:px-8">
                  {summary.recentlyAdded.map((card) => (
                    <CardRailItem
                      key={`${card.variantId}-${card.language}`}
                      href={`/cards/${encodeURIComponent(card.cardId)}`}
                      name={card.name}
                      localId={card.localId}
                      imageBaseUrl={card.imageBaseUrl}
                      caption={card.quantity > 1 ? `×${card.quantity}` : undefined}
                      alt={t('a11y.cardImage', {
                        name: card.name,
                        number: card.localId,
                        set: card.setName,
                      })}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {summary.topCards.length > 0 ? (
              <section>
                <SectionHeader title={t('home.mostValuable')} />
                <div className="snap-row no-scrollbar -mx-5 px-5 lg:-mx-8 lg:px-8">
                  {summary.topCards.map((card) => (
                    <CardRailItem
                      key={`${card.variantId}-${card.language}-top`}
                      href={`/cards/${encodeURIComponent(card.cardId)}`}
                      name={card.name}
                      localId={card.localId}
                      imageBaseUrl={card.imageBaseUrl}
                      caption={formatMoney(card.unit, locale, { showDecimals: false })}
                      alt={t('a11y.cardImage', {
                        name: card.name,
                        number: card.localId,
                        set: card.setName,
                      })}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <div className="grid gap-8 lg:grid-cols-2">
              <section>
                <SectionHeader title={t('home.valueByEra')} />
                <Breakdown rows={summary.bySet} locale={locale} emptyLabel={t('portfolio.noValue')} />
              </section>
              <section>
                <SectionHeader title={t('home.valueByLanguage')} />
                <Breakdown
                  rows={summary.byLanguage.map((row) => ({
                    ...row,
                    label:
                      LANGUAGE_LABELS[toUiLocale(locale)][
                        row.key as keyof (typeof LANGUAGE_LABELS)['en']
                      ] ?? row.label,
                  }))}
                  locale={locale}
                  emptyLabel={t('portfolio.noValue')}
                />
              </section>
            </div>

            {inProgress.length > 0 ? (
              <section>
                <SectionHeader
                  title={t('home.setProgress')}
                  action={
                    <Link href="/sets" className="text-[0.8125rem] text-muted hover:text-paper">
                      {t('app.seeAll')}
                    </Link>
                  }
                />
                <ul className="space-y-2">
                  {inProgress.map((set) => (
                    <li key={set.id}>
                      <Link
                        href={`/sets/${encodeURIComponent(set.id)}`}
                        className="surface-flat flex items-center gap-4 rounded-[var(--radius-tile)] px-4 py-3 transition-colors hover:bg-[var(--color-slate-hi)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-[0.875rem] font-semibold">{set.name}</span>
                            <span className="tnum shrink-0 text-[0.8125rem] text-muted">
                              {set.ownedCount}
                              <span className="text-faint">/{set.cardCountTotal}</span>
                            </span>
                          </div>
                          <Progress
                            owned={set.ownedCount}
                            total={set.cardCountTotal}
                            size="sm"
                            className="mt-2"
                            label={t('a11y.progressBar', {
                              owned: set.ownedCount,
                              total: set.cardCountTotal,
                            })}
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {recentSets.length > 0 ? (
          <section>
            <SectionHeader title={t('home.newSets')} />
            <ul className="space-y-2">
              {recentSets.map((set) => (
                <SetRow
                  key={set.id}
                  set={{ ...set, code: null, value: null }}
                  locale={locale}
                  labels={{
                    progress: t('a11y.progressBar', {
                      owned: set.ownedCount,
                      total: set.cardCountTotal,
                    }),
                    release: t('sets.releaseDate', { date: set.releaseDate ?? '' }),
                    value: t('sets.valueOwned'),
                  }}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </PageSection>
    </>
  );
}

function GainRow({
  summary,
  locale,
  labels,
}: {
  summary: PortfolioSummary;
  locale: string;
  labels: { gain: string; loss: string; spend: string };
}) {
  const delta = summary.totalValue.minor - summary.totalSpend.minor;
  const positive = delta >= 0;
  return (
    <div className="mt-4 flex items-center justify-between gap-4 border-t border-hairline pt-4">
      <div>
        <p className="type-eyebrow mb-1">{labels.spend}</p>
        <p className="tnum text-[0.9375rem] font-semibold">
          {formatMoney(summary.totalSpend, locale)}
        </p>
      </div>
      <div className="text-right">
        <p className="type-eyebrow mb-1">{positive ? labels.gain : labels.loss}</p>
        <p
          className={`tnum text-[0.9375rem] font-semibold ${positive ? 'text-mint' : 'text-rose'}`}
        >
          {positive ? '+' : '−'}
          {formatMoney({ minor: Math.abs(delta), currency: summary.currency }, locale)}
        </p>
      </div>
    </div>
  );
}

/**
 * The front door for someone who has never signed in.
 *
 * Shows the same shelves of real cards and real prices as the signed-in home,
 * because a visitor deciding whether this is worth an account needs to see the
 * thing itself - not a paragraph describing it. The pitch and the sign-up
 * button come after the cards, not before.
 */
async function SignedOutHome({
  locale,
  catalogReady,
  cardLanguage,
  displayCurrency,
}: {
  locale: string;
  catalogReady: boolean;
  cardLanguage: string;
  displayCurrency: Currency;
}) {
  const t = await getTranslations();
  const rails = catalogReady ? await getFeaturedRails(cardLanguage, displayCurrency) : [];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'TrackMyDex',
            url: `${APP_ORIGIN}/${locale}`,
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'Any',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
            description: t('home.signedOutBody'),
          }).replace(/</g, '\\u003c'),
        }}
      />
      <PageHeader
        title={t('home.signedOutTitle')}
        eyebrow={
          <>
            {t('app.tagline')}{' '}
            <a href="https://github.com/swanca/trackmydex-source" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-paper">
              {t('app.openSource')}
            </a>
          </>
        }
      />
      <PageSection className="space-y-8">
        {rails.length > 0 ? (
          rails.map((rail) => <FeaturedRail key={rail.href} rail={rail} locale={locale} />)
        ) : (
          <EmptyState title={t('sets.notSynced')} body={t('sets.notSyncedBody')} />
        )}

        <Surface className="p-5">
          <p className="type-meta max-w-[56ch] text-[0.9375rem]">{t('home.signedOutBody')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/auth/sign-up">
              <Button size="lg">{t('home.signedOutCta')}</Button>
            </Link>
            <Link href="/sets">
              <Button size="lg" variant="secondary">
                {t('home.signedOutSecondary')}
              </Button>
            </Link>
          </div>
        </Surface>
      </PageSection>
    </>
  );
}

function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}
