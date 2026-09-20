'use client';

/**
 * Shared "can this be installed?" state.
 *
 * The browser fires `beforeinstallprompt` exactly once, and whoever calls
 * `preventDefault()` on it owns the only handle to the install dialog. That
 * used to be the popup's private ref, which meant a visitor who dismissed the
 * popup could never install again - the event was gone and nothing else held
 * it.
 *
 * Capturing it at module scope lets the popup and the account menu share one
 * handle, so "install" stays reachable after the popup has been sent away.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/** True on an iPhone, where Safari offers no install event at all. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** Installable through the browser dialog, or installable by hand on iOS. */
export function installState(): 'ready' | 'manual' | 'installed' | 'unavailable' {
  if (installed || isStandalone()) return 'installed';
  if (deferred) return 'ready';
  if (isIosSafari()) return 'manual';
  return 'unavailable';
}

export function subscribeToInstallState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens the browser's install dialog. Resolves to whether the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // The handle is single-use: the browser will not let it be shown twice.
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') {
    installed = true;
    notify();
  }
  return outcome === 'accepted';
}
