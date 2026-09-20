import { getTranslations } from 'next-intl/server';
import type { Currency } from '@/db/schema/enums';
import type { OwnedSealedRow } from '@/server/services/sealed';
import { convert, formatMoney, money, type FxRates } from '@/lib/pricing/money';
import { Badge } from '@/components/ui/Badge';
import { SealedQuantityStepper } from './SealedQuantityStepper';

/**
 * The sealed half of a collection.
 *
 * A row rather than a tile: sealed products have long names and few of them, so
 * a list reads better than a grid and leaves room for the price and the stepper
 * on the same line.
 */
export async function OwnedSealedList({
  rows,
  displayCurrency,
  rates,
}: {
  rows: OwnedSealedRow[];
  displayCurrency: Currency;
  rates: FxRates;
}) {
  const t = await getTranslations();

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        let priceLabel: string | null = null;
        if (row.marketPrice && row.marketCurrency) {
          const unit = convert(
            money(Number(row.marketPrice), row.marketCurrency as Currency),
            displayCurrency,
            rates,
          );
          priceLabel = formatMoney(
            { minor: unit.minor * row.quantity, currency: displayCurrency },
            'en',
          );
        }

        return (
          <li
            key={row.id}
            className="surface flex items-center gap-3 rounded-[var(--radius-tile)] p-3"
          >
            <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-[rgb(148_163_208/0.06)]">
              {row.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- CDN thumbnail
                <img
                  src={row.imageUrl}
                  alt={row.name}
                  loading="lazy"
                  className="size-full object-contain"
                />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] font-medium text-paper">{row.name}</p>
              <p className="truncate text-[0.6875rem] text-faint">
                {row.setLabel ?? row.groupName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{t(`sealed.kind.${row.kind}`)}</Badge>
                {row.state !== 'sealed' ? (
                  <Badge tone="warning">
                    {t(row.state === 'opened' ? 'sealed.stateOpened' : 'sealed.stateDamaged')}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 text-right">
              {priceLabel ? (
                <p className="tnum font-display text-sm font-bold text-paper">{priceLabel}</p>
              ) : (
                <p className="text-[0.6875rem] text-faint">{t('sealed.noPrice')}</p>
              )}
              <SealedQuantityStepper
                sealedProductId={row.sealedProductId}
                state={row.state}
                quantity={row.quantity}
                size="sm"
                className="mt-1 w-24"
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
