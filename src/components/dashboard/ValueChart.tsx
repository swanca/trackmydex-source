import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/pricing/money';
import type { Currency } from '@/db/schema/enums';
import { formatDate } from '@/lib/dates';
import { intlLocale } from '@/lib/intl-locale';

/**
 * Portfolio value over time.
 *
 * Hand-drawn SVG rather than a charting library: this is one series of at most
 * ninety points, and shipping a 60 kB chart bundle to a phone for it would be
 * the wrong trade. It also lets the line use the product's own accent gradient
 * instead of a library's default palette.
 *
 * When there is no history yet the component says so plainly - the data does
 * not exist because no provider sells it, and this instance only starts
 * recording from its first nightly snapshot.
 */
export function ValueChart({
  points,
  currency,
  locale,
  emptyTitle,
  emptyBody,
  className,
}: {
  points: Array<{ date: string; value: number }>;
  currency: Currency;
  locale: string;
  emptyTitle: string;
  emptyBody: string;
  className?: string;
}) {
  if (points.length < 2) {
    return (
      <div
        className={cn(
          'surface-flat rounded-[var(--radius-tile)] px-4 py-6 text-center',
          className,
        )}
      >
        <p className="text-[0.875rem] font-medium text-paper">{emptyTitle}</p>
        <p className="type-meta mx-auto mt-1.5 max-w-[46ch] text-xs">{emptyBody}</p>
      </div>
    );
  }

  const width = 320;
  const height = 96;
  const padding = 6;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(max, 1);

  const x = (index: number) =>
    padding + (index / (points.length - 1)) * (width - padding * 2);
  const y = (value: number) =>
    height - padding - ((value - min) / span) * (height - padding * 2);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(2)},${height} L${x(0).toFixed(2)},${height} Z`;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const change = last.value - first.value;
  const changePercent = first.value === 0 ? 0 : change / first.value;

  return (
    <figure className={cn('surface-flat rounded-[var(--radius-tile)] p-4', className)}>
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="tnum font-display text-lg font-bold">
          {formatMoney({ minor: Math.round(last.value * 100), currency }, locale)}
        </span>
        <span
          className={cn(
            'tnum text-[0.8125rem] font-semibold',
            change >= 0 ? 'text-mint' : 'text-rose',
          )}
        >
          {change >= 0 ? '+' : ''}
          {new Intl.NumberFormat(intlLocale(locale), { style: 'percent', maximumFractionDigits: 1 }).format(
            changePercent,
          )}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
        aria-label={`${formatMoney({ minor: Math.round(first.value * 100), currency }, locale)} → ${formatMoney({ minor: Math.round(last.value * 100), currency }, locale)}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="value-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="value-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#value-area)" />
        <path
          d={line}
          fill="none"
          stroke="url(#value-line)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-2 flex justify-between text-[0.6875rem] text-faint">
        <time dateTime={first.date}>{formatShortDate(first.date, locale)}</time>
        <time dateTime={last.date}>{formatShortDate(last.date, locale)}</time>
      </div>
    </figure>
  );
}

function formatShortDate(date: string, locale: string): string {
  return formatDate(date, locale, { day: 'numeric', month: 'short' }, '');
}
