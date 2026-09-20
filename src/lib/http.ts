import { logger } from './logger';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

interface FetchJsonOptions {
  /** Total attempts including the first. */
  retries?: number;
  timeoutMs?: number;
  /** Treat 404 as an expected absence rather than an error. */
  allowNotFound?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * JSON fetch with bounded retries, jittered backoff and a hard timeout.
 *
 * Upstream catalog APIs are free community services: a sync that hammers them on
 * failure is both rude and self-defeating, so backoff honours `Retry-After` when
 * the server sends one.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T | null> {
  const { retries = 3, timeoutMs = 20_000, allowNotFound = false } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'TrackMyDex/1.0 (+https://github.com/trackmydex)',
          ...options.headers,
        },
      });

      if (response.status === 404 && allowNotFound) return null;

      if (!response.ok) {
        if (RETRYABLE.has(response.status) && attempt < retries) {
          await sleep(backoffMs(attempt, response.headers.get('retry-after')));
          continue;
        }
        throw new HttpError(response.status, url);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (attempt < retries && (isAbort || !(error instanceof HttpError))) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
  }
  const base = Math.min(500 * 2 ** (attempt - 1), 8_000);
  return base + Math.random() * 250;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `worker` over `items` with at most `limit` in flight.
 *
 * Results keep input order. A rejected worker does not cancel its siblings -
 * ingestion must record the failure and carry on, not abort 20,000 cards in.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown; item: T }>> {
  const results = new Array<{ ok: true; value: R } | { ok: false; error: unknown; item: T }>(
    items.length,
  );
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index] as T;
      try {
        results[index] = { ok: true, value: await worker(item, index) };
      } catch (error) {
        results[index] = { ok: false, error, item };
        logger.debug('concurrent task failed', { index, error });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runner));
  return results;
}
