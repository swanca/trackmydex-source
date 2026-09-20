import { cn } from '@/lib/cn';
import { formatMoney, type Money } from '@/lib/pricing/money';

/**
 * Value split by era, language or set.
 *
 * A ranked bar list rather than a pie: people want to know which era carries
 * their collection and by how much, and a bar answers both at a glance while a
 * pie answers neither. Bars are relative to the largest row, so the shape of a
 * collection is readable even when one set dominates.
 */
export function Breakdown({
  rows,
  locale,
  emptyLabel,
  className,
  max = 6,
}: {
  rows: Array<{ key: string; label: string; value: Money; count: number }>;
  locale: string;
  emptyLabel: string;
  className?: string;
  max?: number;
}) {
  if (rows.length === 0) {
    return <p className={cn('type-meta px-1 text-sm', className)}>{emptyLabel}</p>;
  }

  const visible = rows.slice(0, max);
  const peak = Math.max(...visible.map((row) => row.value.minor), 1);

  return (
    <ul className={cn('space-y-2.5', className)}>
      {visible.map((row) => (
        <li key={row.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.8125rem] font-medium text-paper">{row.label}</span>
            <span className="tnum shrink-0 text-[0.8125rem] text-muted">
              {formatMoney(row.value, locale, { compact: row.value.minor > 100_000 })}
            </span>
          </div>
          <div className="progress-track h-1.5">
            <div
              className="h-full rounded-[var(--radius-pill)] bg-[linear-gradient(90deg,var(--color-violet),var(--color-azure))]"
              style={{ width: `${Math.max((row.value.minor / peak) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
