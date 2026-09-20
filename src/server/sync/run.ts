import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { syncError, syncRun } from '@/db/schema';
import type { SyncKind, SyncStatus } from '@/db/schema/enums';
import { logger } from '@/lib/logger';

/**
 * Sync bookkeeping.
 *
 * Two guarantees matter here:
 *  1. Two copies of the same job never run at once, even across app replicas and
 *     a cron container. A Postgres advisory lock gives us that without Redis.
 *  2. A job that half-fails is recorded as `partial` with its errors attached,
 *     so the admin area can show what actually happened instead of a green tick.
 */

const LOCK_NAMESPACE = 0x7c67; // arbitrary, stable

function lockKey(kind: SyncKind): number {
  let hash = 0;
  for (const ch of kind) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return (LOCK_NAMESPACE << 16) | (hash & 0xffff);
}

export class SyncLockedError extends Error {
  constructor(kind: SyncKind) {
    super(`A ${kind} sync is already running`);
    this.name = 'SyncLockedError';
  }
}

export interface SyncContext {
  runId: string;
  kind: SyncKind;
  stats: Record<string, number>;
  /** Records a failure without aborting the run. */
  fail(scope: string, ref: string | null, message: string, detail?: unknown): Promise<void>;
  bump(key: string, by?: number): void;
  log: ReturnType<typeof logger.child>;
}

/**
 * Runs `job` under an advisory lock, writing a `sync_run` row around it.
 *
 * The lock is held on a dedicated connection for the whole job and released in a
 * `finally`, so a crashed job does not wedge the system: Postgres drops
 * session-level advisory locks when the connection goes away.
 */
export async function withSyncRun<T>(
  kind: SyncKind,
  triggeredBy: string,
  job: (ctx: SyncContext) => Promise<T>,
): Promise<{ runId: string; result: T }> {
  const client = await (await import('@/db')).pool.connect();

  const acquired = await client.query<{ locked: boolean }>(
    'select pg_try_advisory_lock($1) as locked',
    [lockKey(kind)],
  );
  if (!acquired.rows[0]?.locked) {
    client.release();
    throw new SyncLockedError(kind);
  }

  const [run] = await db
    .insert(syncRun)
    .values({ kind, triggeredBy, status: 'running' })
    .returning({ id: syncRun.id });

  if (!run) {
    await client.query('select pg_advisory_unlock($1)', [lockKey(kind)]);
    client.release();
    throw new Error('Could not create sync run');
  }

  const log = logger.child({ syncRun: run.id, kind });
  const stats: Record<string, number> = {};
  let errorCount = 0;

  const ctx: SyncContext = {
    runId: run.id,
    kind,
    stats,
    log,
    bump(key, by = 1) {
      stats[key] = (stats[key] ?? 0) + by;
    },
    async fail(scope, ref, message, detail) {
      errorCount += 1;
      log.warn('sync.error', { scope, ref, message });
      await db.insert(syncError).values({
        syncRunId: run.id,
        scope,
        ref: ref?.slice(0, 160) ?? null,
        message: message.slice(0, 2_000),
        detail: detail === undefined ? null : sanitiseDetail(detail),
      });
    },
  };

  const startedAt = Date.now();
  let status: SyncStatus = 'success';

  try {
    const result = await job(ctx);
    status = errorCount > 0 ? 'partial' : 'success';
    return { runId: run.id, result };
  } catch (error) {
    status = 'failed';
    errorCount += 1;
    log.error('sync.failed', { error });
    await db.insert(syncError).values({
      syncRunId: run.id,
      scope: 'run',
      ref: kind,
      message: error instanceof Error ? error.message : String(error),
      detail: error instanceof Error ? { stack: error.stack } : null,
    });
    throw error;
  } finally {
    await db
      .update(syncRun)
      .set({ status, finishedAt: new Date(), stats, errorCount })
      .where(eq(syncRun.id, run.id));
    log.info('sync.finished', { status, durationMs: Date.now() - startedAt, ...stats });
    await client.query('select pg_advisory_unlock($1)', [lockKey(kind)]);
    client.release();
  }
}

function sanitiseDetail(detail: unknown): unknown {
  if (detail instanceof Error) {
    // Drizzle wraps the driver error, so the useful part - the Postgres
    // SQLSTATE, the offending constraint, the column - lives on `cause`.
    // Without unwrapping it an admin sees "Failed query: insert into ..." and
    // has no idea *why* it failed.
    const pg = (detail as { cause?: Record<string, unknown> }).cause;
    return {
      name: detail.name,
      message: detail.message,
      stack: detail.stack?.slice(0, 4_000),
      ...(pg && typeof pg === 'object'
        ? {
            cause: {
              message: pg.message,
              code: pg.code,
              detail: pg.detail,
              constraint: pg.constraint,
              table: pg.table,
              column: pg.column,
              schema: pg.schema,
            },
          }
        : {}),
    };
  }
  try {
    return JSON.parse(JSON.stringify(detail));
  } catch {
    return { value: String(detail) };
  }
}

/** True when a job of this kind is currently holding the lock. */
export async function isSyncRunning(kind: SyncKind): Promise<boolean> {
  const rows = await db
    .select({ id: syncRun.id })
    .from(syncRun)
    .where(and(eq(syncRun.kind, kind), eq(syncRun.status, 'running')))
    .limit(1);
  return rows.length > 0;
}
