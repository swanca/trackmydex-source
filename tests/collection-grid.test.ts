import { describe, expect, it } from 'vitest';
import { buildCollectionSetCardsQuery } from '@/app/api/collection/set-cards/query';
import { collectionCardHref } from '@/lib/collection-links';

describe('collection missing-card query', () => {
  it('uses the preferred printed-card language instead of the interface language', () => {
    const query = buildCollectionSetCardsQuery({
      setId: 'swsh3',
      ownership: 'missing',
      sort: 'number',
      userId: 'u1',
      cardLanguage: 'fr',
      displayLanguage: 'en',
      displayCurrency: 'EUR',
    });

    expect(query.cardLanguage).toBe('fr');
    expect(query.ownership).toBe('missing');
  });
});

describe('collection card links', () => {
  it('keeps the language of the owned printing in the detail link', () => {
    expect(collectionCardHref('swsh3-136', 'fr')).toBe('/cards/swsh3-136?lang=fr');
  });
});
