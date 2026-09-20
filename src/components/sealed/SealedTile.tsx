import { getTranslations } from 'next-intl/server';
import type { Currency } from '@/db/schema/enums';
import { convert, formatMoney, money, type FxRates } from '@/lib/pricing/money';
import { Badge } from '@/components/ui/Badge';
import { SealedQuantityStepper } from './SealedQuantityStepper';

export interface SealedTileData {
  id: string;
  name: string;
  kind: string;
  language: string;
  groupName: string;
  setLabel: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  marketPrice: string | null;
  marketCurrency: string | null;
  ownedQuantity: number;
}

/**
 * A sealed product in the browse grid.
 *
 * The product photograph is the identifier here - collectors recognise a box by
 * its art long before they read its name - so the image gets the space and the
 * name wraps beneath it rather than being truncated to one line.
 *
 * The price is converted into the user's display currency when it needs to be,
 * and says so, because every sealed price we hold is quoted in USD by TCGplayer.
 */
export async function SealedTile({
  product,
  displayCurrency,
  rates,
  signedIn,
}: {
  product: SealedTileData;
  displayCurrency: Currency;
  rates: FxRates;
  signedIn: boolean;
}) {
  const t = await getTranslations();

  let priceLabel: string | null = null;
  let converted = false;
  if (product.marketPrice && product.marketCurrency) {
    const listed = money(Number(product.marketPrice), product.marketCurrency as Currency);
    const shown = convert(listed, displayCurrency, rates);
    converted = listed.currency !== displayCurrency;
    priceLabel = formatMoney(shown, 'en');
  }

  return (
    <article className="surface flex flex-col gap-3 rounded-[var(--radius-tile)] p-3">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-[rgb(148_163_208/0.06)]">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- TCGplayer's CDN
          // is not in the Next image allow-list, and these are already 200px
          // thumbnails served from a CDN, so optimisation would add a hop.
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="size-full object-contain"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-[0.6875rem] text-faint">
            {t('sealed.noImage')}
          </div>
        )}
        {product.ownedQuantity > 0 ? (
          <span className="absolute right-2 top-2 rounded-[var(--radius-pill)] bg-[rgb(139_92_246/0.9)] px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
            ×{product.ownedQuantity}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{t(`sealed.kind.${product.kind}`)}</Badge>
          {product.language !== 'en' ? (
            <Badge tone="neutral">{product.language.toUpperCase()}</Badge>
          ) : null}
        </div>
        <h3 className="text-[0.8125rem] font-medium leading-snug text-paper">{product.name}</h3>
        {/* The set's own name in the reader's language when we have it;
            TCGplayer's English group name is the fallback. */}
        <p className="text-[0.6875rem] text-faint">{product.setLabel ?? product.groupName}</p>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          {priceLabel ? (
            <>
              <p className="tnum font-display text-base font-bold text-paper">{priceLabel}</p>
              <p className="text-[0.625rem] text-faint">
                {converted ? t('sealed.convertedFromUsd') : t('sealed.marketPrice')}
              </p>
            </>
          ) : (
            <p className="text-[0.6875rem] text-faint">{t('sealed.noPrice')}</p>
          )}
        </div>
      </div>

      {signedIn ? (
        <SealedQuantityStepper
          sealedProductId={product.id}
          quantity={product.ownedQuantity}
          size="sm"
        />
      ) : null}
    </article>
  );
}
