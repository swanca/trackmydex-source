import type { CardLanguage, Currency } from '@/db/schema/enums';
import type { CardQuery } from '@/server/services/catalog';

interface CollectionSetCardsQueryInput {
  setId: string;
  ownership: 'all' | 'missing';
  sort: 'number' | 'price-asc' | 'price-desc';
  userId: string;
  cardLanguage: CardLanguage;
  displayLanguage: CardLanguage;
  displayCurrency: Currency;
}

export function buildCollectionSetCardsQuery({
  setId,
  ownership,
  sort,
  userId,
  cardLanguage,
  displayCurrency,
}: CollectionSetCardsQueryInput): CardQuery {
  return {
    setId,
    userId,
    cardLanguage,
    displayCurrency,
    ownership,
    sort,
    limit: 1_000,
  };
}
