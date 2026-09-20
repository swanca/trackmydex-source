'use client';

import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { BinderIcon, BoxIcon, HeartIcon, HomeIcon, SearchIcon, SetsIcon } from './icons';

/**
 * Mobile navigation.
 *
 * Six destinations with the camera raised into a centre control. Three
 * constraints drive the details:
 *
 *  - it must never cover content, so the bar is opaque and every scroll
 *    container reserves `--nav-height` plus the safe-area inset beneath it;
 *  - the camera sits at the thumb's natural arc, because that is the action
 *    you take while physically holding cards;
 *  - seven slots on a 375px phone leaves 53px each, so the labels are 9px
 *    and "Produits scellés" is shortened to "Scellés" here. A label that
 *    wraps or clips is worse than a shorter word that fits.
 *
 * Hidden from pointer-fine, wide viewports where the desktop rail takes over.
 */
export function BottomNav({
  labels,
}: {
  labels: {
    home: string;
    collection: string;
    search: string;
    sets: string;
    sealed: string;
    wishlist: string;
    scan: string;
  };
}) {
  return (
    <nav
      aria-label={labels.home}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 lg:hidden',
        'border-t border-hairline bg-[color-mix(in_srgb,var(--color-ink)_92%,transparent)] backdrop-blur-xl',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto grid h-[var(--nav-height)] max-w-lg grid-cols-7 items-center px-1">
        <NavItem href="/" label={labels.home} icon={<HomeIcon className="size-5" />} exact />
        <NavItem href="/sets" label={labels.sets} icon={<SetsIcon className="size-5" />} />
        <NavItem href="/sealed" label={labels.sealed} icon={<BoxIcon className="size-5" />} />
        <li className="flex justify-center">
          <ScanButton label={labels.scan} />
        </li>
        <NavItem href="/collection" label={labels.collection} icon={<BinderIcon className="size-5" />} />
        <NavItem href="/wishlist" label={labels.wishlist} icon={<HeartIcon className="size-5" />} />
        <NavItem href="/search" label={labels.search} icon={<SearchIcon className="size-5" />} />
      </ul>
    </nav>
  );
}

/**
 * Warm a destination the moment a finger lands on it.
 *
 * Next only prefetches a dynamic route automatically when it has a
 * `loading.js` boundary, and this app cannot have those - on this version
 * they leave the page unhydrated (see HANDOVER.md). So these routes were
 * fetched from cold on every tap, which is the lag you feel between
 * pressing a tab and seeing it.
 *
 * Prefetching all six on sight would be worse: six full server renders per
 * page view, on a machine shared with another site. Starting on
 * `pointerdown` buys the 100-200ms between touch and release, and on a
 * mouse it starts on hover, which is usually longer. Once per destination.
 */
function NavItem({
  href,
  label,
  icon,
  exact,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const warmed = useRef(false);
  const active = exact ? pathname === href : pathname.startsWith(href);

  const warm = useCallback(() => {
    if (warmed.current || active) return;
    warmed.current = true;
    router.prefetch(href);
  }, [active, href, router]);

  return (
    <li>
      <Link
        href={href}
        onPointerEnter={warm}
        onPointerDown={warm}
        onFocus={warm}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors',
          active ? 'text-paper' : 'text-faint hover:text-muted',
        )}
      >
        {icon}
        <span className="w-full truncate px-0.5 text-center text-[0.5625rem] leading-none font-medium">
          {label}
        </span>
        <span
          aria-hidden
          className={cn(
            'h-0.5 w-5 rounded-full transition-opacity',
            active
              ? 'bg-[linear-gradient(90deg,var(--color-violet),var(--color-azure))] opacity-100'
              : 'opacity-0',
          )}
        />
      </Link>
    </li>
  );
}

/**
 * The raised scan control.
 *
 * The reference uses a Poke Ball here. That would be both a trademark liability
 * and the "cartoonish UI" the brief rules out, so the shape stays: a ring lifted
 * off the bar, carrying the accent gradient. It is the only place the gradient
 * appears in the chrome.
 *
 * It opens the camera scanner rather than text search, because the thumb-arc
 * position belongs to the action you take while physically holding cards.
 * Text search has its own rail entry and is a tap away on the home screen.
 */
function ScanButton({ label }: { label: string }) {
  return (
    <Link
      href="/scan"
      aria-label={label}
      className={cn(
        'relative -mt-7 flex size-[52px] items-center justify-center rounded-full',
        'bg-[linear-gradient(135deg,var(--color-violet),var(--color-azure))]',
        'shadow-[0_0_0_5px_var(--color-ink),0_12px_32px_-10px_rgb(99_102_241/0.55)]',
        'transition-transform duration-150 active:scale-95',
      )}
    >
      <span className="absolute inset-[3px] rounded-full bg-[color-mix(in_srgb,var(--color-ink)_86%,transparent)]" />
      <ScanGlyph className="relative size-6 text-paper" />
    </Link>
  );
}

/** A viewfinder: corner brackets around a lens. Reads as "capture", not "find". */
function ScanGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9" />
      <path d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9" />
      <path d="M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15" />
      <path d="M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}
