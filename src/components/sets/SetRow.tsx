import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { setLogo } from '@/lib/images';
import { formatMoney, type Money } from '@/lib/pricing/money';
import { CountReadout, Progress } from '@/components/ui/Progress';
import { CardFan } from '@/components/cards/CardArt';
import { formatMonthYear } from '@/lib/dates';

/**
 * Era header.
 *
 * The reference screenshot puts a region name, a count and a gradient bar in a
 * wide card with artwork bleeding off the right edge. Same structure here, with
 * the sprites replaced by a fan of the user's own cards from that era - this is
 * a card product, and the header should show cards.
 */
export function EraHeader({
  name,
  years,
  owned,
  total,
  value,
  locale,
  fan,
  progressLabel,
}: {
  name: string;
  years: string;
  owned: number;
  total: number;
  value: Money | null;
  locale: string;
  fan: Array<{ url: string | null; alt: string }>;
  progressLabel: string;
}) {
  return (
    <section className="surface relative overflow-hidden rounded-[var(--radius-card)] px-5 py-4">
      {/* The accent wash is anchored to the progress end, so the eye travels
          along the bar rather than being pulled to a random corner. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_100%,rgb(139_92_246/0.12),transparent_58%)]"
      />
      <div className="relative flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="type-eyebrow">{years}</p>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <h2 className="type-title truncate">{name}</h2>
            <CountReadout owned={owned} total={total} className="shrink-0 text-lg" />
          </div>
          <Progress owned={owned} total={total} label={progressLabel} className="mt-3" />
          {value ? (
            <p className="type-meta tnum mt-2.5 text-xs">
              {formatMoney(value, locale, { compact: value.minor > 100_000 })}
            </p>
          ) : null}
        </div>
        <div className="hidden h-[74px] shrink-0 xs:block sm:block">
          <CardFan images={fan} />
        </div>
      </div>
    </section>
  );
}

export interface SetRowData {
  id: string;
  name: string;
  code: string | null;
  releaseDate: string | null;
  logoUrl: string | null;
  cardCountTotal: number;
  ownedCount: number;
  value: Money | null;
}

/**
 * One set.
 *
 * The logo is the identifier collectors actually recognise, so it leads. Where
 * a logo is missing (some promo and trainer-kit sets have none) the set code
 * stands in as a monogram rather than leaving a hole in the row.
 */
export function SetRow({
  set,
  locale,
  labels,
}: {
  set: SetRowData;
  locale: string;
  labels: { progress: string; release: string; value: string };
}) {
  const logo = setLogo(set.logoUrl);
  const complete = set.ownedCount >= set.cardCountTotal && set.cardCountTotal > 0;

  return (
    <li>
      <Link
        href={`/sets/${encodeURIComponent(set.id)}`}
        className={cn(
          'surface-flat group flex items-center gap-4 rounded-[var(--radius-tile)] px-4 py-3.5',
          'transition-colors hover:border-hairline-strong hover:bg-[var(--color-slate-hi)]',
          'active:scale-[0.995]',
        )}
      >
        <div className="relative flex size-[52px] shrink-0 items-center justify-center">
          {logo ? (
            <Image
              src={logo}
              alt=""
              width={52}
              height={52}
              sizes="52px"
              className="max-h-[52px] w-auto object-contain drop-shadow-[0_2px_6px_rgb(0_0_0/0.6)]"
            />
          ) : (
            <span className="type-code flex size-[42px] items-center justify-center rounded-xl border border-hairline bg-[rgb(148_163_208/0.06)] text-faint">
              {set.code ?? set.id.slice(0, 3).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate text-[0.9375rem] leading-tight font-semibold text-paper">
              {set.name}
            </h3>
            <CountReadout
              owned={set.ownedCount}
              total={set.cardCountTotal}
              className="shrink-0 text-[0.8125rem]"
            />
          </div>

          <Progress
            owned={set.ownedCount}
            total={set.cardCountTotal}
            label={labels.progress}
            size="sm"
            className="mt-2"
          />

          <div className="mt-2 flex items-center gap-2.5 text-[0.6875rem] text-faint">
            {set.releaseDate ? (
              <time dateTime={set.releaseDate} className="tnum">
                {formatMonthYear(set.releaseDate, locale)}
              </time>
            ) : null}
            {set.code ? <span className="type-code">{set.code}</span> : null}
            {set.value ? (
              <span className="tnum ml-auto text-muted">
                {formatMoney(set.value, locale, { compact: set.value.minor > 100_000 })}
              </span>
            ) : null}
            {complete ? (
              <span className="ml-auto font-semibold text-mint" aria-label={labels.progress}>
                100%
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
