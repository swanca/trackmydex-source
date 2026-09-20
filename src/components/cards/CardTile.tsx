import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { formatMoney, type Money } from '@/lib/pricing/money';
import type { CardLanguage, PriceConfidence } from '@/db/schema/enums';
import { CardArt } from './CardArt';
import { Badge, ConfidenceMark } from '@/components/ui/Badge';
import { VARIANT_TYPES } from '@/db/schema/enums';
import { CardActions } from './CardActions';

export interface CardTileData {
  id: string;
  localId: string;
  name: string;
  imageBaseUrl: string | null;
  rarity: string | null;
  quantity: number;
  wishlisted: boolean;
  variants?: Array<{ id: string; variantType: string; size: string; price: Money | null }>;
  defaultVariantId: string | null;
  price: Money | null;
  priceConfidence: PriceConfidence | null;
}

/**
 * Grid tile.
 *
 * Every fact the brief asks for is visible without opening the card: art, name,
 * number, rarity, ownership and price. Number and name sit directly under the
 * art where the eye already is, and price sits on the art itself so it
 * survives the name truncating.
 *
 * The actions are two buttons rather than a quantity stepper. Browsing a set
 * is where you decide *whether* you want a card; how many copies you own is a
 * question for the Collection page, and a three-part spinner on every tile
 * asked it 250 times per set.
 */
export async function CardTile({
  card,
  locale,
  cardLanguage,
  priority = false,
}: {
  card: CardTileData;
  locale: string;
  cardLanguage: CardLanguage;
  priority?: boolean;
}) {
  const t = await getTranslations();
  const owned = card.quantity > 0;

  return (
    <article className="group flex flex-col gap-2">
      <Link
        href={`/cards/${encodeURIComponent(card.id)}`}
        aria-label={t('a11y.openCard', { name: card.name })}
        className="relative block rounded-[var(--radius-tile)] transition-transform duration-200 active:scale-[0.98]"
      >
        <CardArt
          imageBaseUrl={card.imageBaseUrl}
          alt={t('a11y.cardImage', {
            name: card.name,
            number: card.localId,
            set: card.rarity ?? '',
          })}
          number={card.localId}
          owned={owned}
          priority={priority}
          className={cn(
            owned &&
              'ring-1 ring-[rgb(148_163_208/0.14)] group-hover:ring-[rgb(139_92_246/0.45)] transition-[box-shadow]',
          )}
        />

        {card.price ? (
          <span
            className={cn(
              'tnum absolute right-1.5 bottom-1.5 rounded-lg px-1.5 py-0.5',
              'bg-[color-mix(in_srgb,var(--color-ink)_78%,transparent)] text-[0.6875rem] font-semibold text-paper backdrop-blur-sm',
            )}
          >
            {formatMoney(card.price, locale, { showDecimals: card.price.minor < 10_000 })}
            <ConfidenceMark confidence={card.priceConfidence} />
          </span>
        ) : null}

        {owned && card.quantity > 1 ? (
          <span className="tnum absolute top-1.5 left-1.5 rounded-lg bg-[rgb(139_92_246/0.9)] px-1.5 py-0.5 text-[0.6875rem] font-bold text-white">
            ×{card.quantity}
          </span>
        ) : null}
      </Link>

      <div className="min-w-0 px-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="type-code shrink-0 text-faint">{card.localId}</span>
          <h3 className="truncate text-[0.8125rem] leading-tight font-semibold text-paper">
            {card.name}
          </h3>
        </div>
        {card.rarity ? (
          <p className="type-meta mt-0.5 truncate text-[0.6875rem]">{card.rarity}</p>
        ) : null}
      </div>

      {card.defaultVariantId ? (
        <CardActions
          cardVariantId={card.defaultVariantId}
          language={cardLanguage}
          locale={locale}
          owned={card.quantity}
          wishlisted={card.wishlisted}
          variants={card.variants ?? []}
          labels={{
            addToCollection: t('card.addToCollection'),
            inCollection: t('card.inCollection'),
            addToWishlist: t('card.addToWishlist'),
            onWishlist: t('card.removeFromWishlist'),
            signInToWishlist: t('card.signInToWishlist'),
            choosePrinting: t('card.choosePrinting'),
            // Resolved here because the picker is a client component and
            // cannot build a message key from a runtime value.
            variantNames: Object.fromEntries(
              VARIANT_TYPES.map((type) => [type, t(`variant.${type}` as never)]),
            ),
          }}
        />
      ) : null}
    </article>
  );
}

/** Horizontal variant used in "recently added" and "most valuable" rails. */
export function CardRailItem({
  href,
  name,
  localId,
  imageBaseUrl,
  caption,
  alt,
}: {
  href: string;
  name: string;
  localId: string;
  imageBaseUrl: string | null;
  caption?: string;
  alt: string;
}) {
  return (
    <Link href={href} className="w-[118px] shrink-0">
      <CardArt imageBaseUrl={imageBaseUrl} alt={alt} sizes="120px" />
      <p className="mt-2 truncate text-[0.75rem] font-semibold text-paper">{name}</p>
      <p className="type-code truncate text-faint">
        {localId}
        {caption ? <span className="ml-1.5 text-muted">{caption}</span> : null}
      </p>
    </Link>
  );
}

export { Badge };
