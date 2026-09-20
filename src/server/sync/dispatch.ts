import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { SyncKind } from '@/db/schema/enums';
import { SyncLockedError, isSyncRunning, withSyncRun } from './run';

/**
 * Fire-and-forget job dispatch.
 *
 * Jobs run in the request process, detached from the response. That is the
 * right trade for a self-hosted product: a queue worker would mean Redis or a
 * second container, and the advisory lock in `withSyncRun` already prevents
 * concurrent or duplicated runs across every replica.
 *
 * The caller gets an immediate answer; the run row is what reports progress.
 */
export interface SyncJobOptions {
  setId?: string;
  limit?: number;
  /** TCGplayer group, for a sealed run scoped to one set. */
  groupId?: number;
}

export async function startSyncJob(
  kind: SyncKind,
  triggeredBy: string,
  options: SyncJobOptions = {},
): Promise<{ started: boolean; message: string }> {
  if (await isSyncRunning(kind)) {
    return { started: false, message: `A ${kind} job is already running` };
  }

  void runJob(kind, triggeredBy, options).catch((error) => {
    if (error instanceof SyncLockedError) return;
    logger.captureException(error, { where: 'startSyncJob', kind });
  });

  return { started: true, message: `${kind} job started` };
}

async function runJob(kind: SyncKind, triggeredBy: string, options: SyncJobOptions) {
  switch (kind) {
    case 'catalog': {
      const { syncCatalog } = await import('./catalog');
      await withSyncRun('catalog', triggeredBy, (ctx) =>
        syncCatalog(ctx, {
          ...(options.setId ? { setIds: [options.setId] } : {}),
          withPrices: true,
          languages: env.CATALOG_LANGUAGES,
        }),
      );
      return;
    }
    case 'translations': {
      const { syncTranslations } = await import('./catalog');
      await withSyncRun('translations', triggeredBy, (ctx) =>
        syncTranslations(ctx, {
          languages: env.CATALOG_LANGUAGES,
          ...(options.setId ? { setIds: [options.setId] } : {}),
        }),
      );
      return;
    }
    case 'prices': {
      const { syncPrices } = await import('./prices');
      await withSyncRun('prices', triggeredBy, (ctx) =>
        syncPrices(ctx, {
          ...(options.setId ? { setId: options.setId } : {}),
          ...(options.limit ? { limit: options.limit } : {}),
        }),
      );
      return;
    }
    case 'sealed': {
      const { syncSealed } = await import('./sealed');
      await withSyncRun('sealed', triggeredBy, (ctx) =>
        syncSealed(ctx, {
          ...(options.groupId ? { groupId: options.groupId } : {}),
          ...(options.limit ? { limit: options.limit } : {}),
        }),
      );
      return;
    }
    case 'snapshot': {
      const { runDailySnapshot } = await import('./snapshot');
      await withSyncRun('snapshot', triggeredBy, (ctx) => runDailySnapshot(ctx));
      return;
    }
  }
}
