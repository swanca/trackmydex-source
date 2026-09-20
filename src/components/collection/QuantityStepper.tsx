'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adjustQuantity } from '@/lib/api-client';
import { adjustGuestQuantity, guestQuantity } from '@/lib/guest-collection';
import { cn } from '@/lib/cn';

/**
 * One-tap quantity control.
 *
 * Collection entry has to be fast and must not open a form, so the count moves
 * the instant it is tapped and the request catches up behind it.
 *
 * It used to do that with `useOptimistic`, and got two things wrong that were
 * both visible:
 *
 *  - The server result was written with `setAuthoritative` *inside* the
 *    transition that owned the optimistic action. React re-applies a pending
 *    optimistic action whenever its base changes, so the +1 landed on top of
 *    the already-incremented server value: tapping + at 2 flashed 4 before
 *    settling on 3.
 *  - The prop was allowed to overrule the mutation whenever it merely
 *    *changed*. `router.refresh()` can be answered from Next's router cache,
 *    so the pre-mutation count arrives as a "new" prop moments later and won
 *    the argument: tapping + at 1 showed 2, then dropped back to 1.
 *
 * Both disappear once the rule is simple: from the first tap, this control
 * owns its number. The prop seeds it and nothing more. The server's answer
 * corrects drift, a failure rolls the tap back, and a stale refresh has
 * nothing left to clobber.
 */
export function QuantityStepper({
  cardVariantId,
  language,
  condition = 'near_mint',
  quantity,
  size = 'md',
  labels,
  onChange,
  className,
}: {
  cardVariantId: string;
  language: string;
  condition?: string;
  quantity: number;
  size?: 'sm' | 'md';
  labels: { add: string; remove: string; count: string };
  onChange?: (quantity: number) => void;
  className?: string;
}) {
  const router = useRouter();

  /** Null until the first tap; from then on this is the count, full stop. */
  const [owned, setOwned] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * Which request is newest.
   *
   * Three quick taps produce three in-flight requests that may answer out of
   * order; without this, the slowest reply would decide the final count.
   */
  const latest = useRef(0);

  const shown = owned ?? quantity;

  // The server renders 0 for anyone signed out, so a guest's own count has to
  // be read back from the browser after mount.
  useEffect(() => {
    if (quantity > 0) return;
    const held = guestQuantity({ cardVariantId, language, condition });
    if (held > 0) setOwned(held);
  }, [cardVariantId, language, condition, quantity]);

  function mutate(delta: number) {
    setError(null);

    // Move now, from whatever is on screen, and never below zero.
    const before = owned ?? quantity;
    const next = Math.max(0, before + delta);
    if (next === before) return;
    setOwned(next);
    onChange?.(next);

    const ticket = ++latest.current;

    startTransition(async () => {
      try {
        const result = await adjustQuantity({ cardVariantId, language, condition, delta });
        // A later tap has already overtaken this one: its answer is the truth.
        if (ticket !== latest.current) return;
        setOwned(result.quantity);
        onChange?.(result.quantity);
        // Let the server components catch up - set progress, portfolio totals.
        // The button has already settled and does not read the result.
        router.refresh();
      } catch (cause) {
        /**
         * Signed out: keep the card in the browser instead of refusing.
         *
         * Making somebody register before they can add a single card loses
         * them - they have no evidence yet that this is worth an email
         * address. The cards move onto the account when they sign up.
         *
         * Detected from the 401 rather than a prop, so no call site has to
         * thread "is this person signed in" down to a stepper.
         */
        if ((cause as { status?: number } | null)?.status === 401) {
          const held = adjustGuestQuantity({ cardVariantId, language, condition }, delta);
          if (ticket !== latest.current) return;
          setOwned(held);
          onChange?.(held);
          return;
        }
        if (ticket !== latest.current) return;
        // Put the count back where it was: the tap did not happen.
        setOwned(before);
        onChange?.(before);
        setError(cause instanceof Error ? cause.message : 'Failed');
      }
    });
  }

  const compact = size === 'sm';
  const buttonSize = compact ? 'size-8' : 'size-10';

  if (shown === 0) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => mutate(1)}
          aria-label={labels.add}
          className={cn(
            'flex w-full items-center justify-center rounded-xl border border-hairline',
            'bg-[rgb(148_163_208/0.08)] text-muted transition-colors',
            'hover:border-[rgb(139_92_246/0.4)] hover:bg-[rgb(139_92_246/0.14)] hover:text-paper',
            'active:scale-[0.97]',
            compact ? 'h-8' : 'h-10',
          )}
        >
          <PlusIcon />
        </button>
        {error ? <p className="mt-1 text-[0.6875rem] text-rose">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        className={cn(
          'flex items-center justify-between rounded-xl border',
          'border-[rgb(139_92_246/0.32)] bg-[rgb(139_92_246/0.12)]',
        )}
      >
        <button
          type="button"
          onClick={() => mutate(-1)}
          aria-label={labels.remove}
          className={cn(
            buttonSize,
            'flex items-center justify-center rounded-l-xl text-[#c4b5fd] transition-colors hover:bg-[rgb(139_92_246/0.2)] active:scale-95',
          )}
        >
          <MinusIcon />
        </button>
        <span
          aria-live="polite"
          aria-label={labels.count}
          className={cn('tnum font-display font-bold text-paper', compact ? 'text-sm' : 'text-base')}
        >
          {shown}
        </span>
        <button
          type="button"
          onClick={() => mutate(1)}
          aria-label={labels.add}
          className={cn(
            buttonSize,
            'flex items-center justify-center rounded-r-xl text-[#c4b5fd] transition-colors hover:bg-[rgb(139_92_246/0.2)] active:scale-95',
          )}
        >
          <PlusIcon />
        </button>
      </div>
      {error ? <p className="mt-1 text-[0.6875rem] text-rose">{error}</p> : null}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-4">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-4">
      <path d="M4 10h12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
