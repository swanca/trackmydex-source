import { Link } from '@/i18n/routing';
import { CARD_ASPECT, cardImage } from '@/lib/images';
import Image from 'next/image';
import { formatMoney } from '@/lib/pricing/money';
import type { CollectionListRow } from '@/server/services/collection';
import type { CardLanguage, Currency } from '@/db/schema/enums';
import { ConfidenceMark, LanguageChip } from '@/components/ui/Badge';
import { QuantityStepper } from './QuantityStepper';

/**
 * One stack in the collection list.
 *
 * A list rather than a grid here, because this screen answers "what do I own
 * and what is it worth" - and a row can carry language, printing, condition,
 * quantity and value legibly at 14px, which a tile cannot.
 */
export function CollectionRow({
  row,
  locale,
  displayCurrency,
  labels,
}: {
  row: CollectionListRow;
  locale: string;
  displayCurrency: Currency;
  labels: {
    variant: string;
    condition: string;
    language: string;
    increment: string;
    decrement: string;
    count: string;
  };
}) {
  const thumbnail = cardImage(row.imageBaseUrl, 'low');
  const unit = row.marketPrice ? Number(row.marketPrice) : null;
  const totalValue =
    unit !== null
      ? {
          minor: Math.round(unit * row.quantity * 100),
          currency: (row.marketCurrency as Currency) ?? displayCurrency,
        }
      : null;

  return (
    <li className="surface-flat flex items-center gap-3 rounded-[var(--radius-tile)] p-2.5">
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
        <Link href={`/cards/${encodeURIComponent(row.cardId)}`} className="block min-w-0">
          <p className="truncate text-[0.875rem] leading-tight font-semibold text-paper">
            {row.cardName}
          </p>
          <p className="type-meta mt-0.5 truncate text-[0.6875rem]">
            <span className="font-mono">{row.localId}</span> · {row.setName}
          </p>
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <LanguageChip language={row.language as CardLanguage} label={labels.language} />
          <span className="text-[0.625rem] text-faint">{labels.variant}</span>
          <span className="text-[0.625rem] text-faint">·</span>
          <span className="text-[0.625rem] text-faint">{labels.condition}</span>
          {totalValue ? (
            <span className="tnum ml-auto text-[0.8125rem] font-semibold text-paper">
              {formatMoney(totalValue, locale)}
              <ConfidenceMark
                confidence={row.marketConfidence === 'approximate' ? 'approximate' : 'exact'}
              />
            </span>
          ) : null}
        </div>
      </div>

      <QuantityStepper
        cardVariantId={row.variantId}
        language={row.language}
        condition={row.condition}
        quantity={row.quantity}
        size="sm"
        labels={{
          add: labels.increment,
          remove: labels.decrement,
          count: labels.count,
        }}
        className="w-[100px] shrink-0"
      />
    </li>
  );
}
