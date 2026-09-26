import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getPublicCollection } from '@/server/services/collection-share';
import { formatMoney, formatNumber } from '@/lib/pricing/money';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { CardArt } from '@/components/cards/CardArt';
import { Button } from '@/components/ui/Button';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; token: string }> }): Promise<Metadata> {
  const { locale, token } = await params;
  const collection = await getPublicCollection(token, locale);
  if (!collection) return { robots: { index: false, follow: true } };
  const t = await getTranslations({ locale, namespace: 'share' });
  const image = `/${locale}/shared/${token}/opengraph-image`;
  return {
    title: t('publicTitle'),
    description: t('publicDescription', { cards: collection.summary.totalCards, sets: collection.summary.setCount }),
    robots: { index: false, follow: true },
    openGraph: { type: 'website', images: [image] },
    twitter: { card: 'summary_large_image', images: [image] },
  };
}

export default async function SharedCollectionPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const [collection, t] = await Promise.all([
    getPublicCollection(token, locale),
    getTranslations({ locale, namespace: 'share' }),
  ]);
  if (!collection) notFound();

  return (
    <>
      <PageHeader title={t('publicTitle')} eyebrow={t('publicSummary', { unique: formatNumber(collection.summary.uniqueCards, locale), total: formatNumber(collection.summary.totalCards, locale) })} />
      <PageSection className="space-y-6">
        {collection.summary.totalValue ? (
          <div className="surface-flat rounded-[var(--radius-tile)] p-4">
            <p className="type-eyebrow mb-1">{t('publicValue')}</p>
            <p className="tnum font-display text-2xl font-bold">{formatMoney(collection.summary.totalValue, locale)}</p>
          </div>
        ) : null}

        <section>
          <h2 className="type-section mb-3">{t('sets')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {collection.sets.map((set) => (
              <div key={set.id} className="surface-flat rounded-xl p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-paper">{set.name}</p>
                  <span className="tnum text-xs text-muted">{set.owned}/{set.total}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgb(148_163_208/0.12)]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-violet),var(--color-azure))]" style={{ width: `${Math.min(set.completion, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {collection.highlights.length > 0 ? (
          <section>
            <h2 className="type-section mb-3">{t('highlights')}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {collection.highlights.map((card) => (
                <li key={card.cardId}>
                  <CardArt imageBaseUrl={card.imageBaseUrl} alt={card.name} sizes="180px" />
                  <p className="mt-1.5 truncate text-xs font-semibold text-paper">{card.name}</p>
                  <p className="type-code text-faint">{card.localId}</p>
                  {card.value ? <p className="tnum text-xs text-mint">{formatMoney(card.value, locale)}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="surface rounded-[var(--radius-card)] p-5 text-center">
          <p className="font-display text-lg font-bold text-paper">{t('ctaTitle')}</p>
          <p className="type-meta mx-auto mt-1 max-w-md">{t('ctaBody')}</p>
          <Link href="/auth/sign-up" className="mt-4 inline-block"><Button>{t('cta')}</Button></Link>
        </div>
      </PageSection>
    </>
  );
}
