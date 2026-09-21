import { authed, json } from '@/server/api';
import { deleteCollection } from '@/server/services/collection';

export const DELETE = authed(
  async ({ user }) => json({ ok: true, ...(await deleteCollection(user.id)) }),
  { scope: 'collection-delete' },
);
