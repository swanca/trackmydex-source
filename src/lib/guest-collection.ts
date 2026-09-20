'use client';

/**
 * A collection held in the browser, before there is an account.
 *
 * Making someone register before they can add a single card is the surest way
 * to lose them: they have no reason to trust the app yet and no evidence it is
 * worth an email address. So the first cards go into localStorage, and signing
 * up moves them to the account rather than starting over.
 *
 * Deliberately not a cookie: this never needs to reach the server except at
 * the one moment it is claimed, and a cookie would ride along on every
 * request for the whole session.
 */

const STORAGE_KEY = 'trackmydex.guest-collection';

/** Enough to recreate a real collection row, and nothing more. */
export interface GuestEntry {
  cardVariantId: string;
  language: string;
  condition: string;
  quantity: number;
}

function read(): GuestEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GuestEntry[]) : [];
  } catch {
    // Private window, cleared storage, or corrupted JSON. An empty guest
    // collection is a perfectly good outcome; it must never throw into a
    // click handler.
    return [];
  }
}

function write(entries: GuestEntry[]): void {
  try {
    if (entries.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage blocked: the change is lost, which is the honest outcome, and
    // the UI is about to tell them to make an account anyway.
  }
  notify();
}

const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}

export function subscribeToGuestCollection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function guestEntries(): GuestEntry[] {
  return read();
}

export function guestCardCount(): number {
  return read().reduce((total, entry) => total + entry.quantity, 0);
}

function sameStack(a: GuestEntry, b: Omit<GuestEntry, 'quantity'>): boolean {
  return (
    a.cardVariantId === b.cardVariantId &&
    a.language === b.language &&
    a.condition === b.condition
  );
}

export function guestQuantity(stack: Omit<GuestEntry, 'quantity'>): number {
  return read().find((entry) => sameStack(entry, stack))?.quantity ?? 0;
}

/**
 * Same contract as the signed-in stepper: the row disappears at zero, so
 * "owned" stays equivalent to "a row exists" on both sides of signing up.
 */
export function adjustGuestQuantity(
  stack: Omit<GuestEntry, 'quantity'>,
  delta: number,
): number {
  const entries = read();
  const index = entries.findIndex((entry) => sameStack(entry, stack));

  if (index === -1) {
    if (delta <= 0) return 0;
    const quantity = Math.min(delta, 9999);
    write([...entries, { ...stack, quantity }]);
    return quantity;
  }

  const next = Math.min(Math.max(entries[index]!.quantity + delta, 0), 9999);
  if (next === 0) {
    write(entries.filter((_, i) => i !== index));
    return 0;
  }
  entries[index] = { ...entries[index]!, quantity: next };
  write([...entries]);
  return next;
}

export function clearGuestCollection(): void {
  write([]);
}
