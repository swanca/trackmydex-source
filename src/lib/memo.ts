import { logger } from './logger';

/**
 * A small in-process cache for reads that are the same for everybody.
 *
 * Some of this app's queries are expensive and answer the same thing all
 * day. The home page's featured rails are the worst: picking the most
 * valuable cards runs a lateral price lookup across all 33,000 rows and then
 * sorts them, which costs about a second - on every single visit, to produce
 * a list that only changes when the nightly price sync runs.
 *
 * Deliberately not `unstable_cache` or a Redis: this is one container with
 * one process, the data is small, and a Map with a timestamp has no
 * configuration, no extra service and nothing to go wrong at 3am.
 *
 * Two properties matter:
 *
 *  - **Single flight.** Ten simultaneous visitors on a cold cache must cause
 *    one query, not ten. Without this the cache makes a traffic spike worse
 *    rather than better, because every request misses at the same moment.
 *  - **Stale while revalidating.** Once a value has been computed, nobody
 *    waits for it again. An expired entry is served immediately and
 *    refreshed behind the response - a list of expensive cards that is two
 *    minutes out of date is not wrong in any way a reader could notice.
 *
 * Only use this for values that do not depend on who is asking. Anything
 * per-user belongs nowhere near it.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
  refreshing: boolean;
}

export interface MemoOptions<A extends unknown[]> {
  /** How long a value is considered fresh. */
  ttlMs: number;
  /** Distinguishes calls with different arguments. */
  key: (...args: A) => string;
  /** For logging, so a slow refresh is attributable. */
  name: string;
}

export function memoAsync<A extends unknown[], T>(
  compute: (...args: A) => Promise<T>,
  { ttlMs, key, name }: MemoOptions<A>,
): (...args: A) => Promise<T> {
  const entries = new Map<string, Entry<T>>();
  const inFlight = new Map<string, Promise<T>>();

  async function load(cacheKey: string, args: A): Promise<T> {
    const existing = inFlight.get(cacheKey);
    if (existing) return existing;

    const promise = compute(...args)
      .then((value) => {
        entries.set(cacheKey, { value, expiresAt: Date.now() + ttlMs, refreshing: false });
        return value;
      })
      .finally(() => {
        inFlight.delete(cacheKey);
      });

    inFlight.set(cacheKey, promise);
    return promise;
  }

  return async (...args: A): Promise<T> => {
    const cacheKey = key(...args);
    const entry = entries.get(cacheKey);

    if (!entry) return load(cacheKey, args);
    if (entry.expiresAt > Date.now()) return entry.value;

    // Stale: answer now, refresh behind the response. A failed refresh keeps
    // the old value rather than turning a slow page into a broken one.
    if (!entry.refreshing) {
      entry.refreshing = true;
      void load(cacheKey, args).catch((error) => {
        entry.refreshing = false;
        logger.warn('memo.refresh_failed', { name, key: cacheKey, error: String(error) });
      });
    }
    return entry.value;
  };
}
