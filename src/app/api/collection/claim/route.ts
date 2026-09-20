import { z } from 'zod';
import { authed, json, readJson } from '@/server/api';
import { adjustQuantity } from '@/server/services/collection';
import { CARD_LANGUAGES, CONDITIONS } from '@/db/schema/enums';
import { logger } from '@/lib/logger';

/**
 * Moves a browser-held collection onto the account that just signed in.
 *
 * Adds rather than replaces, so somebody who already had cards and then
 * browsed signed-out on another device does not lose either side. Rows that
 * no longer resolve are skipped and counted rather than failing the whole
 * claim - losing 200 cards because one printing was retired upstream would be
 * a poor trade.
 */
const claimSchema = z.object({
  entries: z
    .array(
      z.object({
        cardVariantId: z.string().min(1).max(128),
        language: z.enum(CARD_LANGUAGES),
        condition: z.enum(CONDITIONS),
        quantity: z.number().int().min(1).max(9999),
      }),
    )
    .max(5000),
});

export const POST = authed(
  async ({ user, request }) => {
    const { entries } = claimSchema.parse(await readJson(request));

    let claimed = 0;
    let skipped = 0;

    for (const entry of entries) {
      try {
        await adjustQuantity(user.id, {
          cardVariantId: entry.cardVariantId,
          language: entry.language,
          condition: entry.condition,
          delta: entry.quantity,
        });
        claimed += 1;
      } catch {
        skipped += 1;
      }
    }

    logger.info('collection.claimed', { userId: user.id, claimed, skipped });
    return json({ claimed, skipped });
  },
  { scope: 'claim' },
);
