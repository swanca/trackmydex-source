import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { FeaturedRail as Rail } from '@/server/services/featured';
import { formatMoney } from '@/lib/pricing/money';
import { CardArt } from '@/components/cards/CardArt';

/**
 * A shelf of cards with their prices.
 *
 * Horizontally scrolled, and sized so two cards are always visible side by
 * side on a phone: one card per screen makes a rail feel like a dead end,
 * because nothing signals that there is more to the right. Snap points keep
 * the scroll from stopping halfway through a card.
 */
export async function FeaturedRail({ rail, locale }: { rail: Rail; locale: string }) {
  const t = await getTranslations();
  const title = rail.labelKey ? t(`home.rail.${rail.labelKey}` as never) : rail.title;

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="font-display text-[0.9375rem] font-bold text-paper">{title}</h2>
        <Link
          href={rail.href}
          className="shrink-0 text-[0.75rem] font-medium text-muted transition-colors hover:text-paper"
        >
          {t('app.seeAll')}
        </Link>
      </div>

      <ul
        className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-5 pb-1 lg:-mx-8 lg:px-8"
        style={{ scrollbarWidth: 'thin' }}
      >
        {rail.cards.map((card) => (
          <li
            key={card.cardId}
            // 42vw keeps two cards plus their gap on the narrowest phone, and
            // the third peeking is what tells you the row scrolls.
            className="w-[42vw] max-w-[150px] shrink-0 snap-start sm:w-[136px]"
          >
            <Link href={`/cards/${card.cardId}`} className="group block">
              <CardArt
                imageBaseUrl={card.imageBaseUrl}
                alt={card.name}
                sizes="(max-width: 640px) 42vw, 136px"
                className="transition-transform duration-200 group-hover:-translate-y-0.5"
              />
              <p className="mt-2 truncate text-[0.8125rem] font-semibold text-paper">
                {card.name}
              </p>
              <p className="truncate text-[0.6875rem] text-faint">{card.setName}</p>
              {card.price ? (
                <p className="tnum mt-0.5 text-[0.8125rem] font-bold text-mint">
                  {formatMoney(card.price, locale)}
                </p>
              ) : (
                <p className="mt-0.5 text-[0.6875rem] text-faint">{t('card.noPrice')}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
