import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { startSyncJob } from '@/server/sync/dispatch';
import type { SyncKind } from '@/db/schema/enums';

const JOBS = new Set<SyncKind>(['catalog', 'translations', 'prices', 'snapshot', 'sealed']);

/**
 * Scheduler entry point.
 *
 * Lets any external scheduler - host cron, Vercel Cron, Fly machines, a
 * Kubernetes CronJob - drive the nightly work without shelling into the
 * container:
 *
 *   curl -X POST -H "authorization: Bearer $CRON_SECRET" https://host/api/cron/prices
 *
 * Disabled unless CRON_SECRET is set, so an instance that has not configured
 * one cannot be triggered by a stranger. The comparison is constant-time: a
 * plain `===` on a secret leaks its prefix through timing.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ job: string }> },
): Promise<NextResponse> {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'Cron endpoint is disabled' }, { status: 404 });
  }

  const header = request.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  if (!secretsMatch(provided, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { job } = await params;
  if (!JOBS.has(job as SyncKind)) {
    return NextResponse.json({ error: `Unknown job "${job}"` }, { status: 404 });
  }

  const result = await startSyncJob(job as SyncKind, 'cron');
  logger.info('cron.triggered', { job, started: result.started });
  return NextResponse.json(result, { status: result.started ? 202 : 409 });
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
