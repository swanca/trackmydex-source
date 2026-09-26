import { authed, json } from '@/server/api';
import { listCards } from '@/server/services/catalog';
import { resolvePreferences } from '@/lib/user-prefs';
import { buildCollectionSetCardsQuery } from './query';

export const GET = authed(
  async ({ user, request }) => {
    const url = new URL(request.url);
    const setId = url.searchParams.get('setId')?.trim();
    if (!setId) return json({ error: 'setId is required' }, { status: 422 });

    const ownership = url.searchParams.get('ownership') === 'all' ? 'all' : 'missing';
    const requestedSort = url.searchParams.get('sort');
    const sort =
      requestedSort === 'price-asc' || requestedSort === 'price-desc'
        ? requestedSort
        : 'number';
    const locale = url.searchParams.get('locale') ?? user.uiLocale ?? 'en';
    const prefs = resolvePreferences(user, locale);

    const result = await listCards(buildCollectionSetCardsQuery({
      setId,
      userId: user.id,
      cardLanguage: prefs.cardLanguage,
      displayLanguage: prefs.displayLanguage,
      displayCurrency: prefs.displayCurrency,
      ownership,
      sort,
    }));

    return json(result);
  },
  { scope: 'collection-set-cards' },
);
