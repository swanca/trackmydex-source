import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * A single pool per process. Next.js hot-reloads modules in development, so the
 * pool is stashed on `globalThis` to avoid exhausting Postgres connections after
 * a few dozen edits.
 */
const globalForDb = globalThis as unknown as { __tcgVaultPool?: Pool };

function createPool(): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(env.DATABASE_URL.includes('sslmode=require')
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });
}

export const pool = globalForDb.__tcgVaultPool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalForDb.__tcgVaultPool = pool;

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type Database = typeof db;
export { schema };

/**
 * Row shape for `db.execute`.
 *
 * Drizzle constrains raw-SQL result rows to `Record<string, unknown>`, which a
 * plain interface does not satisfy (interfaces have no implicit index
 * signature). Intersecting keeps the named, checked properties while meeting
 * the constraint, so call sites stay typed instead of falling back to `any`.
 */
export type SqlRow<T> = T & Record<string, unknown>;
