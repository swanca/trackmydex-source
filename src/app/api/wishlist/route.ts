import { z } from 'zod';
import { authed, json, readJson } from '@/server/api';
import { CARD_LANGUAGES, CURRENCIES } from '@/db/schema/enums';
import { addToWishlist, removeFromWishlist } from '@/server/services/collection';

const bodySchema = z.object({
  cardVariantId: z.string().min(1).max(128),
  language: z.enum(CARD_LANGUAGES),
  targetPrice: z.number().min(0).max(1_000_000).nullish(),
  targetCurrency: z.enum(CURRENCIES).nullish(),
  priority: z.number().int().min(1).max(5).optional(),
  remove: z.boolean().optional(),
});

export const POST = authed(
  async ({ user, request }) => {
    const body = bodySchema.parse(await readJson(request));

    if (body.remove) {
      await removeFromWishlist(user.id, body.cardVariantId, body.language);
      return json({ wishlisted: false });
    }

    await addToWishlist(user.id, {
      cardVariantId: body.cardVariantId,
      language: body.language,
      targetPrice: body.targetPrice ?? null,
      targetCurrency: body.targetCurrency ?? null,
      priority: body.priority ?? 3,
      notes: null,
    });
    return json({ wishlisted: true });
  },
  { scope: 'wishlist' },
);
