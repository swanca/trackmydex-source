import { sql } from 'drizzle-orm';
import { db } from '@/db';

/**
 * Token-bucket rate limiting backed by Postgres.
 *
 * One statement, one row: refill by elapsed time, then spend a token if any
 * remain. Doing it in SQL makes it atomic under concurrency and correct across
 * multiple app replicas, without adding Redis to a self-hoster's stack.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Bucket capacity, i.e. the maximum burst. */
  limit: number;
  /** Seconds to refill the bucket completely. */
  windowSeconds: number;
}

export async function rateLimit(
  key: string,
  { limit, windowSeconds }: RateLimitOptions,
): Promise<RateLimitResult> {
  const refillPerSecond = limit / windowSeconds;

  const rows = await db.execute<{ tokens: number }>(sql`
    insert into rate_limit_bucket as b (key, tokens, updated_at)
    values (${key}, ${limit - 1}, now())
    on conflict (key) do update
      set tokens = greatest(
            0,
            least(
              ${limit}::numeric,
              b.tokens + extract(epoch from (now() - b.updated_at)) * ${refillPerSecond}::numeric
            ) - 1
          ),
          updated_at = now()
      where least(
              ${limit}::numeric,
              b.tokens + extract(epoch from (now() - b.updated_at)) * ${refillPerSecond}::numeric
            ) >= 1
    returning tokens
  `);

  const row = rows.rows[0];
  if (!row) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(1 / refillPerSecond)),
    };
  }

  return { allowed: true, remaining: Math.floor(Number(row.tokens)), retryAfterSeconds: 0 };
}

/** Best-effort client identity for anonymous limits. */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

export const LIMITS = {
  search: { limit: 60, windowSeconds: 60 },
  mutation: { limit: 240, windowSeconds: 60 },
  csvImport: { limit: 5, windowSeconds: 600 },
  csvExport: { limit: 10, windowSeconds: 600 },
  adminSync: { limit: 4, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitOptions>;
