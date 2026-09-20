import { cn } from '@/lib/cn';
import { MARK_SHAPES, MARK_STROKE, markRotation } from '@/lib/logo-mark';

/**
 * The TrackMyDex mark: a fanned pair of cards, the front one carrying a
 * rising line. A collection, and what it is worth.
 *
 * The geometry lives in `@/lib/logo-mark` so the PWA icons are rasterised
 * from the same numbers instead of a hand-copied duplicate.
 *
 * Drawn as stroked outlines on a plate of the page colour, so it stays
 * legible at 16px in a browser tab and inverts cleanly on the light theme -
 * the plate is `--color-ink`, which each theme already defines as its own
 * background.
 */
export function LogoMark({
  className,
  gradient = true,
}: {
  className?: string;
  /** Off for contexts that need a single flat colour, such as a monochrome favicon. */
  gradient?: boolean;
}) {
  const stroke = gradient ? 'url(#tmd-mark)' : 'currentColor';
  const plate = 'var(--color-ink, #0b0f1a)';

  return (
    <svg viewBox="0 0 48 48" className={cn('size-7', className)} aria-hidden focusable="false">
      {gradient ? (
        <defs>
          {/* userSpaceOnUse, not the default objectBoundingBox: a proportional
              gradient is computed per shape, so the thin trend line would be
              painted from a nearly degenerate box and come out flat. */}
          <linearGradient
            id="tmd-mark"
            gradientUnits="userSpaceOnUse"
            x1="6"
            y1="6"
            x2="42"
            y2="42"
          >
            <stop offset="0" stopColor="var(--color-violet, #8b5cf6)" />
            <stop offset="1" stopColor="var(--color-azure, #38bdf8)" />
          </linearGradient>
        </defs>
      ) : null}

      {MARK_SHAPES.map((shape, index) =>
        shape.kind === 'path' ? (
          <path
            key={index}
            d={shape.d}
            fill="none"
            stroke={stroke}
            strokeWidth={MARK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <rect
            key={index}
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            rx={shape.rx}
            transform={markRotation(shape)}
            fill={shape.plate ? plate : 'none'}
            stroke={stroke}
            strokeWidth={MARK_STROKE}
            strokeLinejoin="round"
          />
        ),
      )}
    </svg>
  );
}

/** Mark plus wordmark, for the header and the install prompt. */
export function Logo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      {showWordmark ? (
        <span className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-paper">
          TrackMyDex
        </span>
      ) : null}
    </span>
  );
}
