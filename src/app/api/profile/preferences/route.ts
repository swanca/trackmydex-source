import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { user as userTable } from '@/db/schema';
import { CARD_LANGUAGES, CURRENCIES } from '@/db/schema/enums';
import { UI_LOCALES } from '@/lib/catalog/eras';
import { authed, json, readJson } from '@/server/api';

const bodySchema = z.object({
  uiLocale: z.enum(UI_LOCALES).optional(),
  defaultCardLanguage: z.enum(CARD_LANGUAGES).optional(),
  displayCurrency: z.enum(CURRENCIES).optional(),
  weeklyDigest: z.boolean().optional(),
});

/**
 * Saves preferences.
 *
 * Writes only the three preference columns, addressed by the session's user id.
 * Role is deliberately not settable here - privilege escalation should not be
 * one forgotten field away.
 */
export const POST = authed(
  async ({ user, request }) => {
    const body = bodySchema.parse(await readJson(request));

    await db
      .update(userTable)
      .set({
        ...(body.uiLocale ? { uiLocale: body.uiLocale } : {}),
        ...(body.defaultCardLanguage ? { defaultCardLanguage: body.defaultCardLanguage } : {}),
        ...(body.displayCurrency ? { displayCurrency: body.displayCurrency } : {}),
        ...(body.weeklyDigest === undefined ? {} : { weeklyDigest: body.weeklyDigest }),
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, user.id));

    return json({ ok: true });
  },
  { scope: 'prefs' },
);
