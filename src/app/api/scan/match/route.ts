import { z } from 'zod';
import { publicRoute, json, readJson } from '@/server/api';
import { CARD_LANGUAGES, CURRENCIES } from '@/db/schema/enums';
import { matchFingerprint } from '@/server/services/scan';
import { LIMITS } from '@/lib/rate-limit';

const bodySchema = z.object({
  /** One 128-bit fingerprint per detected card, as 32 hex characters. */
  fingerprints: z.array(z.string().regex(/^[0-9a-f]{32}$/i)).min(1).max(12),
  cardLanguage: z.enum(CARD_LANGUAGES).default('en'),
  displayCurrency: z.enum(CURRENCIES).default('EUR'),
});

/**
 * Matches one or more scanned cards against the artwork index.
 *
 * Accepts a batch because photographing several cards at once produces several
 * fingerprints from a single frame, and a round trip per card would make a
 * nine-card binder page feel slow.
 *
 * Open to signed-out visitors: identifying a card is a catalogue lookup, and
 * requiring an account to point a camera at a card would be the wrong trade.
 * Rate limited on the search budget.
 */
export const POST = publicRoute(
  async ({ request }) => {
    const body = bodySchema.parse(await readJson(request));

    const results = await Promise.all(
      body.fingerprints.map((hex) =>
        matchFingerprint(hex, {
          cardLanguage: body.cardLanguage,
          displayCurrency: body.displayCurrency,
        }),
      ),
    );

    return json({ results });
  },
  { scope: 'scan', limit: LIMITS.search },
);
