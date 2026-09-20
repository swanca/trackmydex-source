import { z } from 'zod';
import { adminRoute, json, readJson } from '@/server/api';
import { setMapping } from '@/server/services/admin';

const bodySchema = z.object({
  cardVariantId: z.string().min(1).max(128),
  cardmarketProductId: z.number().int().positive().nullable(),
  tcgplayerProductId: z.number().int().positive().nullable(),
});

export const POST = adminRoute(
  async ({ request }) => {
    const body = bodySchema.parse(await readJson(request));
    await setMapping(body);
    return json({ ok: true });
  },
  { scope: 'admin-mapping' },
);
