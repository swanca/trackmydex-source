import { authed, json } from '@/server/api';
import { deleteSealedEntry } from '@/server/services/sealed';

export const DELETE = authed(async ({ user, request }) => {
  const entryId = new URL(request.url).pathname.split('/').pop() ?? '';
  await deleteSealedEntry(user.id, entryId);
  return json({ ok: true });
});
