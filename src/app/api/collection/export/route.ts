import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/session';
import { env } from '@/lib/env';
import { LIMITS, rateLimit } from '@/lib/rate-limit';
import { exportCollectionCsv } from '@/server/services/csv';
import type { Currency } from '@/db/schema/enums';

/**
 * CSV export.
 *
 * Rate limited separately from ordinary mutations: an export scans the whole
 * collection, so it is the one endpoint a user could accidentally hammer into
 * a performance problem for everyone else on a small instance.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 });

  const limit = await rateLimit(`export:${user.id}`, LIMITS.csvExport);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many exports. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const currency = (user.displayCurrency as Currency) ?? env.DEFAULT_CURRENCY;
  const csv = await exportCollectionCsv(user.id, currency);
  const filename = `trackmydex-collection-${new Date().toISOString().slice(0, 10)}.csv`;

  // Leading BOM: without it Excel reads the file as the local codepage and
  // mangles every accented card name, which is most of the French catalog.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
