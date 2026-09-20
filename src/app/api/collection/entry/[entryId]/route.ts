import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/session';
import { deleteEntry } from '@/server/services/collection';
import { error, unauthorized } from '@/server/api';

/**
 * Deletes one stack.
 *
 * The delete is scoped by user id inside the service, so passing somebody
 * else's entry id is a no-op rather than a data loss - the id in the URL is
 * never trusted on its own.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entryId: string }> },
): Promise<NextResponse> {
  const user = await getApiUser();
  if (!user) return unauthorized();

  const { entryId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) return error('Invalid entry id', 422);

  await deleteEntry(user.id, entryId);
  return NextResponse.json({ ok: true });
}
