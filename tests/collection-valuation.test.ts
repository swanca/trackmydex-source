import { describe, expect, it } from 'vitest';
import { buildCollectionGroups, type CollectionGroupSourceRow } from '@/server/services/collection-groups';

const row: CollectionGroupSourceRow = {
  id: 'entry-1',
  cardId: 'swsh11tg-TG05',
  cardName: 'Pikachu',
  localId: 'TG05',
  imageBaseUrl: 'https://example.test/pikachu',
  variantId: 'swsh11tg-TG05::holo',
  variantType: 'holo',
  language: 'fr',
  condition: 'light_played',
  quantity: 2,
  setId: 'swsh11',
  setName: 'Lost Origin',
  setLogoUrl: null,
  setCode: 'LOR',
  setSize: 247,
  releaseDate: '2022-09-09',
  originLanguage: 'en',
  setLanguages: ['en', 'fr'],
  sortIndex: 205,
  price: {
    provider: 'tcgdex.cardmarket',
    currency: 'EUR',
    market: '10.00',
    confidence: 'exact',
    fetchedAt: new Date('2026-09-21T00:00:00Z'),
  },
};

describe('collection groups valuation', () => {
  it('uses the condition-adjusted stack value used by the portfolio total', () => {
    const grouped = buildCollectionGroups([row], 'EUR', {});
    const group = grouped.main[0]!;

    expect(group.value.minor).toBe(1_100);
    expect(group.cards[0]!.unitValue?.minor).toBe(550);
    expect(group.cards[0]!.value?.minor).toBe(1_100);
  });

  it('folds a Trainer Gallery into its parent set without losing its adjusted value', () => {
    const grouped = buildCollectionGroups([{ ...row, setId: 'swsh11tg' }], 'EUR', {});

    expect(grouped.main).toHaveLength(1);
    expect(grouped.main[0]).toMatchObject({ setId: 'swsh11', value: { minor: 1_100 } });
  });
});
