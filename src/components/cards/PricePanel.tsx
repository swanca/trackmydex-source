import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';
import { formatMoney, type Money } from '@/lib/pricing/money';
import { reasonKey } from '@/lib/pricing/select';
import type { CardVariantDetail } from '@/server/services/catalog';
import type { Currency } from '@/db/schema/enums';
import { Badge } from '@/components/ui/Badge';
import { ExternalIcon } from '@/components/layout/icons';
import { formatDate } from '@/lib/dates';
import { cardmarketSearchUrl, tcgplayerProductUrl } from '@/lib/pricing/links';

/**
 * Pricing for one printing.
 *
 * This component carries the product's central honesty requirement: an
 * approximate valuation must never read as a market price. So an approximate
 * figure is prefixed with `~`, tinted amber, and followed by a plain-language
 * statement of exactly what was substituted - condition, variant, language or
 * currency. There is no state in which a number appears without its provenance.
 */
export async function PricePanel({
  variant,
  cardName,
  localId,
  setCode,
  locale,
  displayCurrency,
  className,
}: {
  variant: CardVariantDetail;
  /** Needed to build the Cardmarket search, which has no id-based URL. */
  cardName: string;
  localId: string;
  /** Set abbreviation, e.g. BS. Disambiguates a bare collector number. */
  setCode: string | null;
  locale: string;
  displayCurrency: Currency;
  className?: string;
}) {
  const t = await getTranslations();
  const resolved = variant.resolved;

  if (!resolved) {
    return (
      <div className={cn('surface-flat rounded-[var(--radius-tile)] px-4 py-3.5', className)}>
        <p className="type-meta text-[0.8125rem]">{t('card.noPrice')}</p>
        {variant.cardmarketProductId === null && variant.tcgplayerProductId === null ? (
          <p className="type-meta mt-1 text-[0.75rem] text-faint">{t('card.noMarketLink')}</p>
        ) : null}
      </div>
    );
  }

  const approximate = resolved.confidence === 'approximate';
  const primary = variant.prices.find((price) => price.provider === resolved.provider);

  const secondary: Array<{ label: string; value: Money | null }> = [
    { label: t('card.lowPrice'), value: toMoney(primary?.low, resolved.amount.currency) },
    { label: t('card.trendPrice'), value: toMoney(primary?.trend, resolved.amount.currency) },
    { label: t('card.avg7'), value: toMoney(primary?.avg7, resolved.amount.currency) },
    { label: t('card.avg30'), value: toMoney(primary?.avg30, resolved.amount.currency) },
  ].filter((entry) => entry.value !== null);

  return (
    <div className={cn('surface-flat rounded-[var(--radius-tile)] p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-eyebrow mb-1.5">{t('card.marketPrice')}</p>
          <p
            className={cn(
              'tnum font-display text-[1.75rem] leading-none font-bold tracking-[-0.02em]',
              approximate ? 'text-amber' : 'text-paper',
            )}
          >
            {approximate ? '~' : ''}
            {formatMoney(resolved.amount, locale)}
          </p>
        </div>
        <Badge tone={approximate ? 'warning' : 'positive'}>
          {approximate ? t('portfolio.confidenceApproximate') : t('portfolio.confidenceExact')}
        </Badge>
      </div>

      {secondary.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-hairline pt-3.5 sm:grid-cols-4">
          {secondary.map((entry) => (
            <div key={entry.label}>
              <dt className="text-[0.6875rem] text-faint">{entry.label}</dt>
              <dd className="tnum mt-0.5 text-[0.875rem] font-semibold">
                {formatMoney(entry.value, locale)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {resolved.reasons.length > 0 ? (
        <ul className="mt-3.5 space-y-1 border-t border-hairline pt-3">
          {resolved.reasons.map((reason) => (
            <li key={reason} className="flex gap-2 text-[0.75rem] leading-snug text-amber">
              <span aria-hidden>~</span>
              <span>{translateReason(t, reason)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-3 text-[0.6875rem] text-faint">
        <span>
          {t('card.priceSource')}: <span className="text-muted">{resolved.marketplace}</span>
        </span>
        <span>
          {t('card.priceUpdated', {
            date: formatDate(resolved.fetchedAt, locale),
          })}
        </span>
        {displayCurrency !== resolved.amount.currency ? null : null}
      </div>

      <div className="mt-3 grid gap-2">
        {/* TCGplayer is the only marketplace with a stable id-addressable page,
            so it is the one link that lands exactly on this printing. */}
        {variant.tcgplayerProductId !== null ? (
          <a
            href={tcgplayerProductUrl(variant.tcgplayerProductId)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-[rgb(148_163_208/0.06)] text-[0.8125rem] font-semibold text-paper transition-colors hover:border-hairline-strong hover:bg-[rgb(148_163_208/0.1)]"
          >
            {t('card.openMarket', { marketplace: 'TCGplayer' })}
            <ExternalIcon className="size-4" />
          </a>
        ) : null}

        {/* Cardmarket is a search, and says so, because their product URLs are
            slug-based and the slug cannot be derived from what we hold. */}
        <a
          href={cardmarketSearchUrl(cardName, localId, setCode, locale)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-hairline bg-[rgb(148_163_208/0.06)] text-[0.8125rem] font-semibold text-paper transition-colors hover:border-hairline-strong hover:bg-[rgb(148_163_208/0.1)]"
        >
          {t('card.searchMarket', { marketplace: 'Cardmarket' })}
          <ExternalIcon className="size-4" />
        </a>
      </div>
    </div>
  );
}

function toMoney(value: string | number | null | undefined, currency: Currency): Money | null {
  if (value === null || value === undefined || value === '') return null;
  const amount = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(amount)) return null;
  return { minor: Math.round(amount * 100), currency };
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function translateReason(t: Translator, reason: string): string {
  const key = reasonKey(reason);
  const known = [
    'variant-substitution',
    'language-substitution',
    'condition-adjusted',
    'currency-converted',
  ];
  return known.includes(key) ? t(`portfolio.reason.${key}` as never) : reason;
}
