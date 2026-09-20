'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/cn';
import { installState, promptInstall, subscribeToInstallState } from '@/lib/pwa-install';
import { UserIcon } from './icons';

/**
 * Everything to do with "me", in one place at the top right.
 *
 * Signing in and out, taking the collection away as CSV, bringing one in, and
 * installing the app. These were scattered across the profile page, the
 * collection header and a popup that only appeared once - which meant a
 * visitor who dismissed the popup had no way back to installing, and the CSV
 * buttons crowded the collection title off the screen on a phone.
 */
export function AccountMenu({
  signedIn,
  email,
}: {
  signedIn: boolean;
  email?: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const install = useSyncExternalStore(
    subscribeToInstallState,
    installState,
    () => 'unavailable' as const,
  );

  // Close on an outside click or Escape, the two things every menu must do.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 text-[0.8125rem] font-medium transition-colors',
          open
            ? 'border-[rgb(139_92_246/0.4)] bg-[rgb(139_92_246/0.16)] text-paper'
            : 'border-hairline text-muted hover:text-paper',
        )}
      >
        <UserIcon className="size-4" />
        <span className="hidden sm:inline">{t('account.menu')}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="surface absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-[var(--radius-tile)] p-1.5 shadow-[0_18px_48px_-18px_rgb(0_0_0/0.8)]"
        >
          {signedIn && email ? (
            <p className="truncate px-2.5 pt-1.5 pb-2 text-[0.6875rem] text-faint">{email}</p>
          ) : null}

          {signedIn ? (
            <>
              <MenuLink href="/profile" onNavigate={() => setOpen(false)}>
                {t('account.preferences')}
              </MenuLink>

              {/* A plain anchor, not the router: this is a file download and
                  must not be intercepted by client-side navigation. */}
              <a
                href="/api/collection/export"
                download
                role="menuitem"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                {t('account.exportCsv')}
              </a>

              <MenuLink href="/collection/import" onNavigate={() => setOpen(false)}>
                {t('account.importCsv')}
              </MenuLink>
            </>
          ) : (
            <>
              <MenuLink href="/auth/sign-in" onNavigate={() => setOpen(false)}>
                {t('nav.signIn')}
              </MenuLink>
              <MenuLink href="/auth/sign-up" onNavigate={() => setOpen(false)}>
                {t('auth.createAccount')}
              </MenuLink>
            </>
          )}

          {install !== 'unavailable' && install !== 'installed' ? (
            <>
              <span className="my-1.5 block h-px bg-hairline" />
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  if (install === 'ready') {
                    await promptInstall();
                    setOpen(false);
                  } else {
                    // iOS has no install event; the only route is Share > Add
                    // to Home Screen, so say that rather than offering a button
                    // that cannot do anything.
                    setOpen(false);
                    router.push('#');
                    window.alert(t('pwa.iosInstructions'));
                  }
                }}
                className={itemClass}
              >
                {t('account.installApp')}
              </button>
            </>
          ) : null}

          {signedIn ? (
            <>
              <span className="my-1.5 block h-px bg-hairline" />
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void authClient.signOut().then(() => {
                    setOpen(false);
                    router.refresh();
                  });
                }}
                className={cn(itemClass, 'text-rose')}
              >
                {t('nav.signOut')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const itemClass =
  'block w-full rounded-lg px-2.5 py-2 text-left text-[0.8125rem] text-paper transition-colors hover:bg-[rgb(148_163_208/0.1)] disabled:opacity-50';

function MenuLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} role="menuitem" onClick={onNavigate} className={itemClass}>
      {children}
    </Link>
  );
}
