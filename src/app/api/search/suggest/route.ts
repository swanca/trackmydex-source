import { publicRoute, json } from '@/server/api';
import { searchCards } from '@/server/services/search';
import { LIMITS } from '@/lib/rate-limit';
import { resolvePreferences } from '@/lib/user-prefs';
import { toUiLocale } from '@/lib/catalog/languages';

/**
 * Type-ahead for the search box.
 *
 * Runs the same matcher as the results page rather than a simplified one, so
 * what the dropdown promises is exactly what pressing Enter delivers. Capped
 * at eight rows: a suggestion list is for recognising, not for browsing.
 */
export const GET = publicRoute(
  async ({ request, user }) => {
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') ?? '').trim();
    const locale = toUiLocale(url.searchParams.get('locale') ?? 'en');

    // Two characters is where results stop being the whole catalogue.
    if (query.length < 2) return json({ hits: [] });

    const prefs = resolvePreferences(user, locale);
    const { hits } = await searchCards({
      query,
      userId: user?.id ?? null,
      cardLanguage: prefs.cardLanguage,
      displayCurrency: prefs.displayCurrency,
      limit: 8,
    });

    return json({
      hits: hits.map((hit) => ({
        id: hit.id,
        name: hit.name,
        localId: hit.localId,
        setName: hit.setName,
        imageBaseUrl: hit.imageBaseUrl,
        price: hit.price ? { minor: hit.price.minor, currency: hit.price.currency } : null,
      })),
    });
  },
  { limit: LIMITS.search, scope: 'suggest' },
);
