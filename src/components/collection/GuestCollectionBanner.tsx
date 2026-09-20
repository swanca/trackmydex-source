'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  clearGuestCollection,
  guestCardCount,
  guestEntries,
  subscribeToGuestCollection,
} from '@/lib/guest-collection';

/**
 * Two jobs, one component, because they are two halves of the same story.
 *
 * Signed out with cards in the browser: say plainly that they are not saved
 * yet and offer the account that would save them. The message only appears
 * once there is something to lose - a banner asking a visitor with an empty
 * collection to register is just a nag.
 *
 * Signed in with cards still in the browser: claim them, then clear. This is
 * the moment the promise made above is kept, and it has to happen wherever
 * the person lands after signing in, which is why it lives in the layout
 * rather than on one page.
 */
export function GuestCollectionBanner({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [claimed, setClaimed] = useState<number | null>(null);

  const count = useSyncExternalStore(
    subscribeToGuestCollection,
    guestCardCount,
    () => 0,
  );

  useEffect(() => {
    if (!signedIn) return;
    const entries = guestEntries();
    if (entries.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/collection/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entries }),
        });
        if (!response.ok) return;
        const body = (await response.json()) as { claimed: number };
        // Cleared only after the server confirms, so a failed claim leaves
        // the cards in the browser to try again rather than losing them.
        clearGuestCollection();
        if (cancelled) return;
        setClaimed(body.claimed);
        router.refresh();
      } catch {
        // Offline or interrupted: the cards stay put and this runs again on
        // the next page load.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, router]);

  if (signedIn) {
    if (claimed === null || claimed === 0) return null;
    return (
      <p className="mx-5 mb-4 rounded-xl border border-[rgb(52_211_153/0.3)] bg-[rgb(52_211_153/0.08)] px-3.5 py-2.5 text-[0.8125rem] text-mint lg:mx-8">
        {t('collection.guestClaimed', { count: claimed })}
      </p>
    );
  }

  if (count === 0) return null;

  return (
    <div className="mx-5 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[rgb(245_181_68/0.28)] bg-[rgb(245_181_68/0.08)] px-3.5 py-2.5 lg:mx-8">
      <p className="flex-1 text-[0.8125rem] text-amber">
        {t('collection.guestPending', { count })}
      </p>
      <Link
        href="/auth/sign-up"
        className="shrink-0 rounded-[var(--radius-pill)] bg-[rgb(245_181_68/0.18)] px-3 py-1.5 text-[0.75rem] font-semibold text-amber transition-colors hover:bg-[rgb(245_181_68/0.28)]"
      >
        {t('collection.guestSave')}
      </Link>
    </div>
  );
}
