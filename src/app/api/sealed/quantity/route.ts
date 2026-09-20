import { authed, json, readJson } from '@/server/api';
import { adjustSealedQuantity, sealedQuantitySchema } from '@/server/services/sealed';

/**
 * The sealed equivalent of the card quantity stepper: one indexed upsert,
 * returning the authoritative quantity for the optimistic UI to reconcile.
 */
export const POST = authed(
  async ({ user, request }) => {
    const body = sealedQuantitySchema.parse(await readJson(request));
    const result = await adjustSealedQuantity(user.id, body);
    return json(result);
  },
  { scope: 'quantity' },
);
