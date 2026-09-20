import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireUser } from '@/lib/session';
import { resolvePreferences } from '@/lib/user-prefs';
import { LANGUAGE_LABELS, toUiLocale } from '@/lib/catalog/languages';
import { CARD_ASPECT, cardImage } from '@/lib/images';
import { formatMoney } from '@/lib/pricing/money';
import type { CardLanguage, Currency } from '@/db/schema/enums';
import { listWishlist } from '@/server/services/collection';
import { PageHeader, PageSection } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge, ConfidenceMark, LanguageChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { ExternalIcon } from '@/components/layout/icons';
import { WishlistRemoveButton } from '@/components/collection/WishlistRemoveButton';

/**
 * Wishlist.
 *
 * Sorted by priority then value, because the list is a shopping plan rather
 * than an archive. A card whose market estimate has fallen to or below the
 * target price is called out - that is the moment the list exists to catch.
 */
export default async function WishlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations();
  const user = await requireUser(locale, '/wishlist');
  const prefs = resolvePreferences(user, locale);
  const rows = await listWishlist(user.id, prefs.cardLanguage);

  const uiLocale = toUiLocale(locale);
  const languageLabels = LANGUAGE_LABELS[uiLocale];

  const totalToBuy = rows.reduce((sum, row) => {
    const price = row.marketPrice ? Number(row.marketPrice) : 0;
    return sum + Math.round(price * 100);
  }, 0);

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title={t('wishlist.title')} />
        <PageSection>
          <EmptyState
            title={t('wishlist.empty')}
            body={t('wishlist.emptyBody')}
            action={
              <Link href="/search">
                <Button>{t('search.title')}</Button>
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
        title={t('wishlist.title')}
        eyebrow={t('wishlist.subtitle', { count: rows.length })}
      />

      <PageSection className="space-y-4">
        <div className="surface-flat flex items-baseline justify-between gap-4 rounded-[var(--radius-tile)] px-4 py-3">
          <p className="type-eyebrow">{t('wishlist.totalTarget')}</p>
          <p className="tnum font-display text-lg font-bold">
            {formatMoney({ minor: totalToBuy, currency: prefs.displayCurrency }, locale)}
          </p>
        </div>

        <ul className="space-y-2">
          {rows.map((row) => {
            const thumbnail = cardImage(row.imageBaseUrl, 'low');
            const market = row.marketPrice ? Number(row.marketPrice) : null;
            const target = row.targetPrice ? Number(row.targetPrice) : null;
            const atTarget = market !== null && target !== null && market <= target;

            return (
              <li
                key={row.id}
                className={`surface-flat flex items-center gap-3 rounded-[var(--radius-tile)] p-2.5 ${
                  atTarget ? 'border-[rgb(52_211_153/0.35)]' : ''
                }`}
              >
                <Link
                  href={`/cards/${encodeURIComponent(row.cardId)}`}
                  className="relative w-[46px] shrink-0 overflow-hidden rounded-lg bg-ink-soft"
                  style={{ aspectRatio: String(CARD_ASPECT) }}
                >
                  {thumbnail ? (
                    <Image src={thumbnail} alt="" fill sizes="46px" className="object-cover" />
                  ) : null}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link href={`/cards/${encodeURIComponent(row.cardId)}`}>
                    <p className="truncate text-[0.875rem] leading-tight font-semibold">
                      {row.cardName}
                    </p>
                    <p className="type-meta mt-0.5 truncate text-[0.6875rem]">
                      <span className="font-mono">{row.localId}</span> · {row.setName}
                    </p>
                  </Link>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <LanguageChip
                      language={row.language as CardLanguage}
                      label={languageLabels[row.language as keyof typeof languageLabels]}
                    />
                    <Badge>{t(`variant.${row.variantType}` as never)}</Badge>
                    {atTarget ? <Badge tone="positive">{t('wishlist.belowTarget')}</Badge> : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {market !== null ? (
                    <span className="tnum text-[0.875rem] font-semibold">
                      {formatMoney(
                        {
                          minor: Math.round(market * 100),
                          currency: (row.marketCurrency as Currency) ?? prefs.displayCurrency,
                        },
                        locale,
                      )}
                      <ConfidenceMark
                        confidence={row.marketConfidence === 'approximate' ? 'approximate' : 'exact'}
                      />
                    </span>
                  ) : null}
                  {target !== null ? (
                    <span className="tnum text-[0.6875rem] text-faint">
                      {t('wishlist.targetPrice')}{' '}
                      {formatMoney(
                        {
                          minor: Math.round(target * 100),
                          currency: (row.targetCurrency as Currency) ?? prefs.displayCurrency,
                        },
                        locale,
                      )}
                    </span>
                  ) : null}

                  <div className="flex items-center gap-1">
                    {row.marketUrl ? (
                      <a
                        href={row.marketUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        aria-label={t('card.openMarket', { marketplace: 'Cardmarket' })}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-[rgb(148_163_208/0.1)] hover:text-paper"
                      >
                        <ExternalIcon className="size-4" />
                      </a>
                    ) : null}
                    <WishlistRemoveButton
                      cardVariantId={row.variantId}
                      language={row.language}
                      label={t('card.removeFromWishlist')}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </PageSection>
    </>
  );
}
