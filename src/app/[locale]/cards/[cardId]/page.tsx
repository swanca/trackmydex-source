import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/session';
import { cardImage } from '@/lib/images';
import { resolvePreferences } from '@/lib/user-prefs';
import { LANGUAGE_LABELS, LOCALE_DEFAULT_CARD_LANGUAGE, toUiLocale } from '@/lib/catalog/languages';
import { localizedAlternates } from '@/lib/seo';
import { CARD_LANGUAGES, CONDITIONS, type CardLanguage } from '@/db/schema/enums';
import { CONDITIONS_ORDERED } from '@/lib/pricing/condition';
import { DETAIL_IMAGE_SIZES } from '@/lib/images';
import { getCardDetail, getCardPriceHistory } from '@/server/services/catalog';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { CardArt } from '@/components/cards/CardArt';
import { CardEntryEditor } from '@/components/cards/CardEntryEditor';
import { PricePanel } from '@/components/cards/PricePanel';
import { Badge, LanguageChip, VariantChip } from '@/components/ui/Badge';
import { ValueChart } from '@/components/dashboard/ValueChart';
import { eraLabel, type EraTranslator } from '@/lib/catalog/eras';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; cardId: string }>;
}): Promise<Metadata> {
  const { locale, cardId } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const card = await getCardDetail(decodeURIComponent(cardId), null, LOCALE_DEFAULT_CARD_LANGUAGE[toUiLocale(locale)], 'EUR');
  if (!card) return {};

  return {
    title: t('cardTitle', { name: card.name, set: card.setName, number: card.localId }),
    description: t('cardDescription', {
      name: card.name,
      number: card.localId,
      set: card.setName,
      rarity: card.rarity ?? '—',
      artist: card.illustrator ?? '—',
    }),
    alternates: localizedAlternates(locale, `/cards/${encodeURIComponent(cardId)}`),
    openGraph: {
      // Built through the helper, not by hand: a fallback image is already a
      // complete URL and appending /high.png to one yields a 403.
      images: (() => {
        const url = cardImage(card.imageBaseUrl, 'high');
        return url ? [{ url }] : [];
      })(),
    },
  };
}

/**
 * Card detail.
 *
 * Two columns on desktop, one on a phone with the art first: on a phone you
 * arrive here from a grid and need to confirm you tapped the right card before
 * anything else. Every printing gets its own price block, because pricing a
 * reverse holo from a normal-print figure is the error this product exists to
 * avoid.
 */
export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; cardId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { locale, cardId: rawCardId } = await params;
  const cardId = decodeURIComponent(rawCardId);
  setRequestLocale(locale);

  const search = await searchParams;
  const t = await getTranslations();
  const user = await getCurrentUser();
  const prefs = resolvePreferences(user, locale);

  const cardLanguage: CardLanguage = (CARD_LANGUAGES as readonly string[]).includes(
    search.lang ?? '',
  )
    ? (search.lang as CardLanguage)
    : // Names follow the interface. The ?lang= switcher still overrides it,
      // because on a card page the point of switching is to read that exact
      // printing's own wording.
      prefs.displayLanguage;

  const card = await getCardDetail(cardId, user?.id ?? null, cardLanguage, prefs.displayCurrency);
  if (!card) notFound();

  const uiLocale = toUiLocale(locale);
  const languageLabels = LANGUAGE_LABELS[uiLocale];
  const defaultVariant = card.variants[0];
  const history = defaultVariant ? await getCardPriceHistory(defaultVariant.id, 180) : [];
  const ownedTotal = card.ownedEntries.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <>
      <PageHeader
        backHref={`/sets/${encodeURIComponent(card.setId)}`}
        backLabel={card.setName}
        eyebrow={`${eraLabel(t as EraTranslator, card.eraId, card.eraName)} · ${card.seriesName}`}
        title={card.name}
      />

      <PageSection className="space-y-6 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-4">
          <div className="mx-auto max-w-[320px] lg:max-w-none">
            <CardArt
              imageBaseUrl={card.imageBaseUrl}
              alt={t('a11y.cardImage', {
                name: card.name,
                number: card.localId,
                set: card.setName,
              })}
              quality="high"
              sizes={DETAIL_IMAGE_SIZES}
              priority
              className="shadow-[0_24px_60px_-24px_rgb(0_0_0/0.95)] ring-1 ring-[rgb(148_163_208/0.16)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge mono>{card.localId}</Badge>
            {card.rarity ? <Badge>{card.rarity}</Badge> : null}
            {ownedTotal > 0 ? (
              <Badge tone="positive">
                {t('card.owned')} ×{ownedTotal}
              </Badge>
            ) : (
              <Badge>{t('card.notOwned')}</Badge>
            )}
            {card.regulationMark ? <Badge mono>{card.regulationMark}</Badge> : null}
          </div>

          {card.nameFallback ? (
            <p className="type-meta rounded-xl border border-[rgb(245_181_68/0.28)] bg-[rgb(245_181_68/0.08)] px-3 py-2 text-[0.75rem] text-amber">
              {t('card.translationMissing', { language: languageLabels[cardLanguage] })}
            </p>
          ) : null}

          {card.availableLanguages.length > 1 ? (
            <div>
              <p className="type-eyebrow mb-1.5">{t('card.language')}</p>
              <div className="flex flex-wrap gap-1.5">
                {card.availableLanguages.map((language) => (
                  <Link
                    key={language}
                    href={`/cards/${encodeURIComponent(card.id)}?lang=${language}`}
                    scroll={false}
                    className={
                      language === cardLanguage
                        ? 'rounded-md ring-1 ring-[rgb(139_92_246/0.5)]'
                        : 'rounded-md'
                    }
                  >
                    <LanguageChip language={language} label={languageLabels[language]} />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <dl className="surface-flat grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-[var(--radius-tile)] p-4 sm:grid-cols-3">
            <Field label={t('card.set')} value={card.setName} />
            <Field label={t('card.number')} value={`${card.localId} / ${card.setCardCountTotal}`} mono />
            <Field label={t('card.rarity')} value={card.rarity ?? '—'} />
            <Field
              label={t('card.artist')}
              value={
                card.illustrator ? (
                  <Link
                    href={`/search?q=${encodeURIComponent(card.illustrator)}`}
                    className="underline decoration-hairline-strong underline-offset-2 hover:text-paper"
                  >
                    {card.illustrator}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <Field label={t('card.category')} value={card.category} />
            {card.hp ? <Field label={t('card.hp')} value={card.hp} mono /> : null}
            {card.types.length > 0 ? (
              <Field label={t('card.types')} value={card.types.join(' · ')} />
            ) : null}
          </dl>

          <section>
            <p className="type-eyebrow mb-2">{t('card.variantsAvailable')}</p>
            <div className="space-y-3">
              {card.variants.map((variant) => (
                <div key={variant.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <VariantChip
                      variant={variant.variantType}
                      label={t(`variant.${variant.variantType}` as never)}
                    />
                    {variant.cardmarketProductId ? (
                      <span className="type-code text-faint">
                        CM {variant.cardmarketProductId}
                      </span>
                    ) : null}
                  </div>
                  <PricePanel
                    variant={variant}
                    cardName={card.name}
                    localId={card.localId}
                    setCode={card.setCode ?? null}
                    locale={locale}
                    displayCurrency={prefs.displayCurrency}
                  />
                </div>
              ))}
            </div>
          </section>

          {history.length > 1 ? (
            <section>
              <p className="type-eyebrow mb-2">{t('card.priceHistory')}</p>
              <ValueChart
                points={history.map((point) => ({ date: point.date, value: point.market }))}
                currency={history[0]?.currency ?? prefs.displayCurrency}
                locale={locale}
                emptyTitle={t('card.priceHistoryEmpty')}
                emptyBody={t('home.valueOverTimeEmptyBody')}
              />
            </section>
          ) : null}

          {user ? (
            <CardEntryEditor
              cardId={card.id}
              variants={card.variants.map((variant) => ({
                id: variant.id,
                variantType: variant.variantType,
                label: t(`variant.${variant.variantType}` as never),
              }))}
              languages={card.availableLanguages.map((language) => ({
                value: language,
                label: languageLabels[language],
              }))}
              conditions={CONDITIONS_ORDERED.filter((condition) =>
                CONDITIONS.includes(condition),
              ).map((condition) => ({
                value: condition,
                label: t(`condition.${condition}` as never),
              }))}
              entries={card.ownedEntries.map((entry) => ({
                id: entry.id,
                variantId: entry.variantId,
                language: entry.language,
                condition: entry.condition,
                quantity: entry.quantity,
                purchasePrice: entry.purchasePrice,
                purchaseCurrency: entry.purchaseCurrency,
                purchaseDate: entry.purchaseDate,
                notes: entry.notes,
              }))}
              defaultLanguage={cardLanguage}
              defaultCurrency={prefs.displayCurrency}
              wishlisted={card.wishlisted}
              labels={{
                add: t('card.addCopy'),
                edit: t('card.editEntry'),
                yourCopies: t('card.yourCopies'),
                variant: t('card.variant'),
                language: t('card.language'),
                condition: t('card.condition'),
                quantity: t('card.quantity'),
                purchasePrice: t('card.purchasePrice'),
                purchaseDate: t('card.purchaseDate'),
                notes: t('card.notes'),
                notesPlaceholder: t('card.notesPlaceholder'),
                save: t('app.save'),
                saving: t('app.saving'),
                remove: t('app.remove'),
                cancel: t('app.cancel'),
                increment: t('collection.increment'),
                decrement: t('collection.decrement'),
                count: t('collection.quantityLabel', { count: ownedTotal }),
                wishlistAdd: t('card.addToWishlist'),
                wishlistRemove: t('card.removeFromWishlist'),
                conditionHelp: t('condition.help'),
                estimateFor: t('condition.estimateFor'),
                multiplier: t('condition.multiplier'),
              }}
              locale={locale}
              // Near-mint reference per printing. The editor applies the
              // condition multiplier client-side so the figure updates as the
              // user changes the dropdown, with no round trip.
              basePrices={Object.fromEntries(
                card.variants.map((variant) => [
                  variant.id,
                  variant.resolved
                    ? {
                        amount: variant.resolved.amount.minor / 100,
                        currency: variant.resolved.amount.currency,
                      }
                    : null,
                ]),
              )}
            />
          ) : (
            <Link
              href="/auth/sign-in"
              className="surface-flat block rounded-[var(--radius-tile)] px-4 py-3.5 text-center text-[0.875rem] font-semibold text-paper"
            >
              {t('card.addToCollection')}
            </Link>
          )}
        </div>
      </PageSection>
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] text-faint">{label}</dt>
      <dd
        className={`mt-0.5 truncate text-[0.875rem] font-medium text-paper ${mono ? 'font-mono tnum' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
