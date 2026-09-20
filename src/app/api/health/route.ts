import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness plus readiness in one endpoint.
 *
 * Container platforms and uptime monitors need a cheap, unauthenticated check.
 * It reports the database round-trip because an app process that is up but
 * cannot reach Postgres is not actually serving anything.
 */
export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { status: 'ok', database: 'ok', latencyMs: Date.now() - startedAt },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { status: 'degraded', database: 'unreachable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
