import { authed, json, readJson } from '@/server/api';
import { collectionEntrySchema, upsertEntry } from '@/server/services/collection';

export const POST = authed(
  async ({ user, request }) => {
    const body = collectionEntrySchema.parse(await readJson(request));
    const result = await upsertEntry(user.id, body);
    return json(result);
  },
  { scope: 'entry' },
);
