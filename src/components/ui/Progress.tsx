import { cn } from '@/lib/cn';

/**
 * Completion bar.
 *
 * The gradient fill is one of only three places the accent appears, which is
 * what makes progress the thing your eye finds first on a wall of set rows.
 * A started-but-tiny set still shows a sliver, because "1 of 200" reading as
 * empty is a lie about the collection.
 */
export function Progress({
  owned,
  total,
  label,
  className,
  size = 'md',
}: {
  owned: number;
  total: number;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.min(owned / safeTotal, 1);
  const complete = owned >= total && total > 0;
  const width = ratio === 0 ? 0 : Math.max(ratio * 100, 2);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={owned}
      aria-label={label}
      className={cn('progress-track w-full', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
    >
      <div
        className="progress-fill h-full"
        data-complete={complete || undefined}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/** Compact "98/100" readout. The owned half is emphasised, the total recedes. */
export function CountReadout({
  owned,
  total,
  className,
}: {
  owned: number;
  total: number;
  className?: string;
}) {
  return (
    <p className={cn('tnum font-display font-bold tracking-[-0.02em]', className)}>
      <span className="text-paper">{owned}</span>
      <span className="text-faint">/{total}</span>
    </p>
  );
}
