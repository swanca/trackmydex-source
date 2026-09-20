'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { LogoMark } from '@/components/layout/Logo';

/**
 * Install prompt.
 *
 * A self-contained, respectful nudge. The rules it follows, and why:
 *
 *  - Phones only. Installing is meaningful on a phone home screen; on desktop it
 *    is noise.
 *  - Sixty seconds of *active* use, not elapsed time. The timer pauses when the
 *    tab is hidden, so leaving a tab open overnight does not earn a prompt.
 *  - The timer survives client-side navigation. It lives in a ref on a component
 *    that never unmounts, so browsing four sets in a minute counts as a minute.
 *  - Never during sign-in, sign-up or an import. Interrupting a form to sell an
 *    install is the behaviour the brief explicitly rules out.
 *  - Dismissal is remembered for two weeks; installing silences it permanently.
 *  - It is a small card in the bottom-right, above the nav and inside the safe
 *    area. It never blocks the interface and it is never a full-screen modal.
 *
 * iOS has no programmatic install API, so Safari gets concise Add to Home
 * Screen instructions in the same card rather than a button that cannot work.
 */

const STORAGE_KEY = 'trackmydex.install-prompt';
const ACTIVE_MS_REQUIRED = 60_000;
/**
 * Dismissed once is dismissed for good.
 *
 * This used to come back after a fortnight, which is the behaviour every
 * visitor already resents on other sites. Installing stays one tap away in the
 * account menu, so nothing is lost by taking no for an answer.
 */
const TICK_MS = 1_000;

/** Routes where an install nudge would interrupt something the user is doing. */
const BLOCKED_PATH_PATTERNS = [/\/auth(\/|$)/, /\/collection\/import(\/|$)/, /\/admin(\/|$)/];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface StoredState {
  dismissedAt?: number;
  installed?: boolean;
}

function readState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredState) : {};
  } catch {
    return {};
  }
}

function writeState(next: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readState(), ...next }));
  } catch {
    // Private mode or blocked storage: the prompt simply reappears next session.
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    // iOS Safari predates the display-mode media query for installed apps.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isPhone(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 860px)').matches;
  return coarse && narrow;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iosDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Macintosh; touch points disambiguate it.
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iosDevice || iPadOs;
}

export interface PwaInstallPromptLabels {
  title: string;
  body: string;
  install: string;
  dismiss: string;
  iosTitle: string;
  iosBody: string;
}

export function PwaInstallPrompt({ labels }: { labels: PwaInstallPromptLabels }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const activeMs = useRef(0);
  const eligible = useRef(false);

  const blocked = BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(pathname));

  /* Capture the browser's install event whenever it fires. Chrome dispatches it
     early, long before our timer is up, so we hold it rather than reacting. */
  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setPlatform('android');
      if (eligible.current) setVisible(true);
    }
    function onInstalled() {
      writeState({ installed: true });
      setVisible(false);
      deferredPrompt.current = null;
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  /* Accrue active time. The interval only advances while the document is
     visible, which is what makes this "a minute of use" and not "a minute". */
  useEffect(() => {
    if (!isPhone() || isStandalone()) return;

    const state = readState();
    if (state.installed) return;
    if (state.dismissedAt) return;

    const ios = isIos();
    if (ios) setPlatform('ios');

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      activeMs.current += TICK_MS;
      if (activeMs.current < ACTIVE_MS_REQUIRED) return;

      eligible.current = true;
      window.clearInterval(timer);
      // Android needs the captured event; iOS needs nothing but instructions.
      if (deferredPrompt.current || ios) setVisible(true);
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  const dismiss = useCallback(() => {
    writeState({ dismissedAt: Date.now() });
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    const event = deferredPrompt.current;
    if (!event) return;
    setVisible(false);
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') writeState({ installed: true });
    else writeState({ dismissedAt: Date.now() });
    deferredPrompt.current = null;
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && visible) dismiss();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible, dismiss]);

  if (!visible || blocked || !platform) return null;

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-labelledby="install-title"
      className={cn(
        'fixed right-3 z-50 w-[min(19rem,calc(100vw-1.5rem))] lg:hidden',
        'surface rounded-[var(--radius-tile)] p-3.5',
        'shadow-[0_18px_44px_-18px_rgb(0_0_0/0.95)]',
        'rise',
      )}
      style={{
        // Sits above the bottom nav and clears the home indicator.
        bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + 12px)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* The app's own mark, not a generic download glyph. An install
            prompt with no branding is indistinguishable from the ones people
            have learned to close on sight. */}
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-hairline bg-[rgb(148_163_208/0.08)]">
          <LogoMark className="size-6" />
        </span>

        <div className="min-w-0 flex-1">
          <p id="install-title" className="text-[0.875rem] leading-tight font-semibold">
            {platform === 'ios' ? labels.iosTitle : labels.title}
          </p>
          <p className="mt-1 text-[0.75rem] leading-snug text-muted">
            {platform === 'ios' ? labels.iosBody : labels.body}
          </p>

          {platform === 'android' ? (
            <button
              type="button"
              onClick={install}
              className="mt-2.5 h-8 rounded-lg bg-[linear-gradient(100deg,var(--color-violet),var(--color-azure))] px-3.5 text-[0.8125rem] font-semibold text-white active:scale-95"
            >
              {labels.install}
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label={labels.dismiss}
          className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-[rgb(148_163_208/0.1)] hover:text-paper"
        >
          <svg viewBox="0 0 20 20" aria-hidden className="size-4">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
