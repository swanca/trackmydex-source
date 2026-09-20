'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adjustQuantity, toggleWishlist } from '@/lib/api-client';
import { adjustGuestQuantity } from '@/lib/guest-collection';
import { cn } from '@/lib/cn';
import { formatMoney, type Money } from '@/lib/pricing/money';

/**
 * What you can do to a card while browsing.
 *
 * A grid is where you decide *whether* you want a card, not how many copies
 * you own - so a three-part +/- stepper on every tile was the wrong control
 * in the wrong place. Two buttons say what they do: put it in my collection,
 * or put it on my wishlist.
 *
 * Both are additive on purpose. A browse grid is somewhere people tap
 * quickly, sometimes by accident, and nothing here should be able to delete
 * a stack of four cards by mistake: the collection button only ever adds,
 * and quantities are adjusted on the Collection page or the card's own page.
 * The heart is a true toggle, because un-wanting something loses nothing.
 *
 * The owned count is shown as a small badge rather than a spinner. It is
 * feedback, not a control - you cannot set a number here, which is the whole
 * point of the change.
 *
 * Printings are the other half. A reverse holo is a different card to own
 * and a different price, and adding the default silently filed every one of
 * them as normal. About 28% of cards have more than one printing, so the
 * button asks only when there is something to ask: one printing stays one
 * tap, several open a short list with their prices.
 */
export interface ActionVariant {
  id: string;
  variantType: string;
  size: string;
  price: Money | null;
}

export function CardActions({
  cardVariantId,
  language,
  locale,
  owned,
  wishlisted,
  variants = [],
  labels,
  className,
}: {
  cardVariantId: string;
  language: string;
  locale: string;
  owned: number;
  wishlisted: boolean;
  /** Every printing of this card. One means no choice to make. */
  variants?: ActionVariant[];
  labels: {
    addToCollection: string;
    inCollection: string;
    addToWishlist: string;
    onWishlist: string;
    signInToWishlist: string;
    choosePrinting: string;
    variantNames: Record<string, string>;
  };
  className?: string;
}) {
  const router = useRouter();

  // From the first tap these own their state; the props only seed them. The
  // server re-render can be answered from Next's router cache and arrive
  // carrying the pre-mutation values, which is what used to make a count
  // jump forward and then fall back.
  const [count, setCount] = useState<number | null>(null);
  const [wanted, setWanted] = useState<boolean | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const latestAdd = useRef(0);
  const latestWish = useRef(0);
  const [picking, setPicking] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const choices = variants.length > 1 ? variants : [];

  // Dismiss on any tap elsewhere: a menu that only closes by choosing is a
  // trap on a phone, where there is no Escape key in reach.
  useEffect(() => {
    if (!picking) return;
    const close = (event: Event) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPicking(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [picking]);

  const shownCount = count ?? owned;
  const shownWanted = wanted ?? wishlisted;

  function addToCollection(variantId: string = cardVariantId) {
    setPicking(false);
    setError(null);
    const before = count ?? owned;
    setCount(before + 1);
    const ticket = ++latestAdd.current;

    startTransition(async () => {
      try {
        const result = await adjustQuantity({
          cardVariantId: variantId,
          language,
          condition: 'near_mint',
          delta: 1,
        });
        if (ticket !== latestAdd.current) return;
        // The tile counts the card, not the printing: somebody holding a
        // French and an English copy owns two. Using the stack count here
        // made the number drop the moment a second language was touched.
        setCount(result.cardTotal);
        router.refresh();
      } catch (cause) {
        // Signed out: keep it in the browser and claim it at sign-up, rather
        // than demanding an email address before the first card.
        if ((cause as { status?: number } | null)?.status === 401) {
          const held = adjustGuestQuantity(
            { cardVariantId: variantId, language, condition: 'near_mint' },
            1,
          );
          if (ticket !== latestAdd.current) return;
          setCount(held);
          return;
        }
        if (ticket !== latestAdd.current) return;
        setCount(before);
        setError(cause instanceof Error ? cause.message : 'Failed');
      }
    });
  }

  function toggleWanted() {
    setError(null);
    const before = wanted ?? wishlisted;
    setWanted(!before);
    const ticket = ++latestWish.current;

    startTransition(async () => {
      try {
        const result = await toggleWishlist({ cardVariantId, language, remove: before });
        if (ticket !== latestWish.current) return;
        setWanted(result.wishlisted);
        router.refresh();
      } catch (cause) {
        if (ticket !== latestWish.current) return;
        setWanted(before);
        /**
         * Signed out: say so, do not show a raw 401.
         *
         * Cards added while signed out are kept in the browser and claimed
         * at sign-up, but a wishlist is not - it carries target prices and
         * priorities that have nowhere to live without an account. Better to
         * be plain about that than to pretend the tap worked.
         */
        setError(
          (cause as { status?: number } | null)?.status === 401
            ? labels.signInToWishlist
            : cause instanceof Error
              ? cause.message
              : 'Failed',
        );
      }
    });
  }

  return (
    <div className={cn('relative', className)} ref={pickerRef}>
      {/* Anchored above the button so a thumb does not cover the list it
          just opened. */}
      {picking && choices.length > 0 ? (
        <div
          role="menu"
          aria-label={labels.choosePrinting}
          className="absolute bottom-full left-0 z-30 mb-1.5 w-full overflow-hidden rounded-xl border border-[rgb(139_92_246/0.5)] bg-slate-hi shadow-[0_18px_44px_-10px_rgb(0_0_0/0.85)]"
        >
          {choices.map((variant) => (
            <button
              key={variant.id}
              type="button"
              role="menuitem"
              onClick={() => addToCollection(variant.id)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[0.75rem] transition-colors hover:bg-[rgb(139_92_246/0.16)]"
            >
              <span className="font-medium text-paper">
                {labels.variantNames[variant.variantType] ?? variant.variantType}
                {/* Only when it distinguishes: a jumbo is a different object
                    to own, "standard" is just noise on every other row. */}
                {variant.size && variant.size.toLowerCase() !== 'standard' ? (
                  <span className="ml-1 text-faint">({variant.size})</span>
                ) : null}
              </span>
              {variant.price ? (
                <span className="tnum text-[0.6875rem] text-mint">
                  {formatMoney(variant.price, locale)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => (choices.length > 0 ? setPicking((open) => !open) : addToCollection())}
          aria-haspopup={choices.length > 0 ? 'menu' : undefined}
          aria-expanded={choices.length > 0 ? picking : undefined}
          aria-label={
            choices.length > 0
              ? labels.choosePrinting
              : shownCount > 0
                ? labels.inCollection
                : labels.addToCollection
          }
          title={shownCount > 0 ? labels.inCollection : labels.addToCollection}
          className={cn(
            'relative flex h-8 flex-1 items-center justify-center rounded-xl border transition-colors active:scale-[0.97]',
            shownCount > 0
              ? 'border-[rgb(139_92_246/0.45)] bg-[rgb(139_92_246/0.18)] text-[#c4b5fd]'
              : 'border-hairline bg-[rgb(148_163_208/0.08)] text-muted hover:border-[rgb(139_92_246/0.4)] hover:bg-[rgb(139_92_246/0.14)] hover:text-paper',
          )}
        >
          {shownCount > 0 ? <CheckIcon /> : <PlusIcon />}
          {shownCount > 1 ? (
            <span className="tnum ml-1 text-[0.6875rem] font-bold">{shownCount}</span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={toggleWanted}
          aria-label={shownWanted ? labels.onWishlist : labels.addToWishlist}
          aria-pressed={shownWanted}
          title={shownWanted ? labels.onWishlist : labels.addToWishlist}
          className={cn(
            'flex h-8 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors active:scale-[0.97]',
            shownWanted
              ? 'border-[rgb(244_114_182/0.45)] bg-[rgb(244_114_182/0.16)] text-[#f9a8d4]'
              : 'border-hairline bg-[rgb(148_163_208/0.08)] text-muted hover:border-[rgb(244_114_182/0.4)] hover:bg-[rgb(244_114_182/0.12)] hover:text-[#f9a8d4]',
          )}
        >
          <HeartIcon filled={shownWanted} />
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-4" fill="none">
      <path
        d="m4.5 10.5 3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-4">
      <path
        d="M10 16.5s-6-3.9-6-8a3.4 3.4 0 0 1 6-2.2A3.4 3.4 0 0 1 16 8.5c0 4.1-6 8-6 8Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
