'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { adjustSealedQuantity } from '@/lib/api-client';
import { cn } from '@/lib/cn';

/**
 * One-tap quantity control for a sealed product.
 *
 * Same contract as the card stepper, and the same fix: from the first tap
 * this control owns its number, the prop only seeds it. See QuantityStepper
 * for why - a pending optimistic action re-applied on a changed base flashed
 * the wrong total, and a `router.refresh()` answered from the router cache
 * could put the pre-mutation count back.
 */
export function SealedQuantityStepper({
  sealedProductId,
  state = 'sealed',
  quantity,
  size = 'md',
  className,
}: {
  sealedProductId: string;
  state?: string;
  quantity: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  /** Null until the first tap; from then on this is the count, full stop. */
  const [owned, setOwned] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** Guards against out-of-order replies when somebody taps quickly. */
  const latest = useRef(0);

  const shown = owned ?? quantity;

  function mutate(delta: number) {
    setError(null);

    const before = owned ?? quantity;
    const next = Math.max(0, before + delta);
    if (next === before) return;
    setOwned(next);

    const ticket = ++latest.current;

    startTransition(async () => {
      try {
        const result = await adjustSealedQuantity({ sealedProductId, state, delta });
        if (ticket !== latest.current) return;
        setOwned(result.quantity);
        router.refresh();
      } catch (cause) {
        if (ticket !== latest.current) return;
        // Put the count back where it was: the tap did not happen.
        setOwned(before);
        setError(cause instanceof Error ? cause.message : t('app.error'));
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
          aria-label={t('sealed.add')}
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
      <div className="flex items-center justify-between rounded-xl border border-[rgb(139_92_246/0.32)] bg-[rgb(139_92_246/0.12)]">
        <button
          type="button"
          onClick={() => mutate(-1)}
          aria-label={t('sealed.remove')}
          className={cn(
            buttonSize,
            'flex items-center justify-center rounded-l-xl text-[#c4b5fd] transition-colors hover:bg-[rgb(139_92_246/0.2)] active:scale-95',
          )}
        >
          <MinusIcon />
        </button>
        <span
          aria-live="polite"
          aria-label={t('sealed.owned')}
          className={cn('tnum font-display font-bold text-paper', compact ? 'text-sm' : 'text-base')}
        >
          {shown}
        </span>
        <button
          type="button"
          onClick={() => mutate(1)}
          aria-label={t('sealed.add')}
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
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
      <path d="M4.5 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
