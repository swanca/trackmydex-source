import { authed, json, readJson } from '@/server/api';
import { adjustQuantity, quantityDeltaSchema } from '@/server/services/collection';

/**
 * The hot path.
 *
 * Every + and − in the app lands here. It does one indexed upsert and returns
 * the authoritative quantity, which the optimistic UI reconciles against.
 */
export const POST = authed(
  async ({ user, request }) => {
    const body = quantityDeltaSchema.parse(await readJson(request));
    const result = await adjustQuantity(user.id, body);
    return json(result);
  },
  { scope: 'quantity' },
);
