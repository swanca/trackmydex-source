import { authed, json, readJson } from '@/server/api';
import { sealedEntrySchema, upsertSealedEntry } from '@/server/services/sealed';

export const POST = authed(
  async ({ user, request }) => {
    const body = sealedEntrySchema.parse(await readJson(request));
    const id = await upsertSealedEntry(user.id, body);
    return json({ id });
  },
  { scope: 'entry' },
);
