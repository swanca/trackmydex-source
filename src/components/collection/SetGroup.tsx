import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { CollectionSetGroup } from '@/server/services/collection-groups';
import { formatMoney } from '@/lib/pricing/money';
import { CardArt } from '@/components/cards/CardArt';
import { QuantityStepper } from './QuantityStepper';
import { SetMark } from '@/components/sets/SetMark';

/**
 * One set in the collection, collapsed to a single line until opened.
 *
 * Built on `<details>` rather than React state: it works before hydration,
 * survives a page refresh mid-scroll, and the browser's own find-in-page can
 * open it. The first set is open so the screen is never a row of shut
 * drawers.
 */
export async function SetGroup({
  group,
  locale,
  defaultOpen = false,
}: {
  group: CollectionSetGroup;
  locale: string;
  defaultOpen?: boolean;
}) {
  const t = await getTranslations();

  return (
    <details open={defaultOpen} className="surface overflow-hidden rounded-[var(--radius-tile)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[rgb(148_163_208/0.05)]">
        <span className="flex size-10 shrink-0 items-center justify-center">
          <SetMark
            logoUrl={group.setLogoUrl}
            code={group.setCode}
            setId={group.setId}
            name={group.setName}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.875rem] font-semibold text-paper">
            {group.setName}
          </span>
          <span className="block text-[0.6875rem] text-faint">
            {t('collection.ownedOfSet', {
              owned: group.uniqueCards,
              total: group.setSize || group.uniqueCards,
            })}
            {group.totalCards > group.uniqueCards
              ? ` · ${t('collection.copies', { count: group.totalCards })}`
              : ''}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="tnum block text-[0.875rem] font-bold text-paper">
            {formatMoney(group.value, locale)}
          </span>
        </span>

        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="size-4 shrink-0 text-faint transition-transform [details[open]_&]:rotate-180"
        >
          <path
            d="m5 7.5 5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>

      <ul className="grid grid-cols-2 gap-3 border-t border-hairline p-3 sm:grid-cols-3 lg:grid-cols-4">
        {group.cards.map((card) => (
          <li key={card.id}>
            <Link href={`/cards/${card.cardId}`} className="block">
              <CardArt imageBaseUrl={card.imageBaseUrl} alt={card.cardName} sizes="160px" />
              <p className="mt-1.5 truncate text-[0.75rem] font-medium text-paper">
                {card.cardName}
              </p>
              <p className="type-code truncate text-faint">
                {card.localId} · {t(`condition.${card.condition}` as never)}
              </p>
              {card.value ? (
                <p className="tnum text-[0.75rem] font-semibold text-mint">
                  {formatMoney(card.value, locale)}
                </p>
              ) : null}
            </Link>
            <QuantityStepper
              cardVariantId={card.variantId}
              language={card.language}
              condition={card.condition}
              quantity={card.quantity}
              size="sm"
              className="mt-1.5"
              labels={{
                add: t('collection.increment'),
                remove: t('collection.decrement'),
                count: t('collection.quantityLabel', { count: card.quantity }),
              }}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
