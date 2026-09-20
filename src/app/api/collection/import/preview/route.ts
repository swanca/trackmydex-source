import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/session';
import { LIMITS, rateLimit } from '@/lib/rate-limit';
import { previewImport } from '@/server/services/csv';

/** 4 MB is roughly 40,000 rows - far past the 20,000-row cap the parser applies. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Dry run.
 *
 * Parses, validates and resolves every row without writing anything. The size
 * cap is enforced before the body is read into memory so an oversized upload
 * cannot be used to exhaust the process.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 });

  const limit = await rateLimit(`import:${user.id}`, LIMITS.csvImport);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many imports. Try again shortly.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (4 MB maximum)' }, { status: 413 });
  }

  const csv = await request.text();
  if (csv.length > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (4 MB maximum)' }, { status: 413 });
  }
  if (!csv.trim()) {
    return NextResponse.json({ error: 'That file is empty' }, { status: 422 });
  }

  const preview = await previewImport(user.id, csv);
  return NextResponse.json(preview);
}
