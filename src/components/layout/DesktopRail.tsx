'use client';

import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import {
  BinderIcon,
  BoxIcon,
  GearIcon,
  HeartIcon,
  HomeIcon,
  SearchIcon,
  SetsIcon,
  UserIcon,
} from './icons';
import { LogoMark } from './Logo';

/**
 * Desktop navigation.
 *
 * Not a stretched mobile bar: a persistent left rail, because a desktop user
 * has horizontal room to spare and vertical room is what the card grid wants.
 * Labels are always visible - an icon-only rail forces people to hover to find
 * anything.
 */
export function DesktopRail({
  labels,
  isAdmin,
  signedIn,
}: {
  labels: {
    home: string;
    collection: string;
    search: string;
    sets: string;
    sealed: string;
    wishlist: string;
    profile: string;
    admin: string;
    signIn: string;
  };
  isAdmin: boolean;
  signedIn: boolean;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-hairline bg-[color-mix(in_srgb,var(--color-ink)_70%,transparent)] px-4 py-6 backdrop-blur-xl lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
        <LogoMark className="size-8" />
        <span className="font-display text-[1.0625rem] font-bold tracking-[-0.02em]">
          TrackMyDex
        </span>
      </Link>

      <nav aria-label={labels.home} className="flex flex-1 flex-col gap-1">
        <RailItem href="/" label={labels.home} icon={<HomeIcon className="size-5" />} exact />
        <RailItem href="/sets" label={labels.sets} icon={<SetsIcon className="size-5" />} />
        <RailItem href="/sealed" label={labels.sealed} icon={<BoxIcon className="size-5" />} />
        <RailItem href="/search" label={labels.search} icon={<SearchIcon className="size-5" />} />
        <RailItem
          href="/collection"
          label={labels.collection}
          icon={<BinderIcon className="size-5" />}
        />
        <RailItem href="/wishlist" label={labels.wishlist} icon={<HeartIcon className="size-5" />} />
      </nav>

      <div className="flex flex-col gap-1 border-t border-hairline pt-3">
        {isAdmin ? (
          <RailItem href="/admin" label={labels.admin} icon={<GearIcon className="size-5" />} />
        ) : null}
        <RailItem
          href={signedIn ? '/profile' : '/auth/sign-in'}
          label={signedIn ? labels.profile : labels.signIn}
          icon={<UserIcon className="size-5" />}
        />
      </div>
    </aside>
  );
}

function RailItem({
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

  // Same reasoning as the phone bar: these routes are dynamic and cannot
  // carry a `loading.js`, so Next never prefetches them on its own.
  const warm = useCallback(() => {
    if (warmed.current || active) return;
    warmed.current = true;
    router.prefetch(href);
  }, [active, href, router]);

  return (
    <Link
      href={href}
      onPointerEnter={warm}
      onFocus={warm}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-11 items-center gap-3 rounded-xl px-3 text-[0.875rem] font-medium transition-colors',
        active
          ? 'bg-[rgb(139_92_246/0.14)] text-paper'
          : 'text-muted hover:bg-[rgb(148_163_208/0.07)] hover:text-paper',
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute top-2.5 bottom-2.5 -left-4 w-0.5 rounded-r-full bg-[linear-gradient(180deg,var(--color-violet),var(--color-azure))]"
        />
      ) : null}
      {icon}
      {label}
    </Link>
  );
}

