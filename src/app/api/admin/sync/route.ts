import { z } from 'zod';
import { adminRoute, json, readJson } from '@/server/api';
import { LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { startSyncJob } from '@/server/sync/dispatch';

const bodySchema = z.object({
  kind: z.enum(['catalog', 'translations', 'prices', 'snapshot', 'sealed']),
  setId: z.string().max(64).optional(),
});

/**
 * Manual job trigger.
 *
 * Returns as soon as the job has started. A full catalog import runs for tens
 * of minutes, which no HTTP request should be holding open, so progress is
 * observed through the run list instead. If a job of the same kind already
 * holds the advisory lock, this answers 409 rather than queueing a second one.
 */
export const POST = adminRoute(
  async ({ user, request }) => {
    const body = bodySchema.parse(await readJson(request));
    const started = await startSyncJob(body.kind, `admin:${user.id}`, {
      ...(body.setId ? { setId: body.setId } : {}),
    });

    logger.info('admin.sync_triggered', { kind: body.kind, by: user.id, started: started.started });
    return json(started);
  },
  { scope: 'admin-sync', limit: LIMITS.adminSync },
);
