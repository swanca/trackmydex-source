import { z } from 'zod';
import { authed, json, readJson } from '@/server/api';
import {
  createCollectionShare,
  getCollectionShare,
  revokeCollectionShare,
  setCollectionShareValueVisibility,
} from '@/server/services/collection-share';

const visibilitySchema = z.object({ showValue: z.boolean() });

export const GET = authed(
  async ({ user }) => json({ share: await getCollectionShare(user.id) }),
  { scope: 'collection-share-read' },
);

export const POST = authed(
  async ({ user }) => json({ share: await createCollectionShare(user.id) }),
  { scope: 'collection-share-write' },
);

export const PATCH = authed(
  async ({ user, request }) => {
    const { showValue } = visibilitySchema.parse(await readJson(request));
    const share = await setCollectionShareValueVisibility(user.id, showValue);
    return share ? json({ share }) : json({ error: 'Share not found' }, { status: 404 });
  },
  { scope: 'collection-share-write' },
);

export const DELETE = authed(
  async ({ user }) => {
    await revokeCollectionShare(user.id);
    return json({ shared: false });
  },
  { scope: 'collection-share-write' },
);
