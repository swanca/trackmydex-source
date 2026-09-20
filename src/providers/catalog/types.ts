import type { CardLanguage, VariantType } from '@/db/schema/enums';

/**
 * Catalog provider abstraction.
 *
 * Everything the ingestion layer knows about an upstream source is declared here.
 * A second provider (pokemontcg.io, a licensed dataset, a self-hosted TCGdex
 * instance) only has to produce these shapes; nothing downstream changes.
 */

export interface ProviderSeries {
  id: string;
  name: string;
  logoUrl?: string | null;
}

export interface ProviderSet {
  id: string;
  seriesId: string;
  /**
   * Language this set's catalogue entry came from.
   *
   * Not cosmetic: Japanese, Korean and Chinese releases are separate sets with
   * their own ids, their own series and their own marketplace products - they
   * are not translations of a western set. A set discovered in the `ja`
   * catalogue is canonically Japanese, and its prices describe Japanese cards.
   */
  originLanguage?: CardLanguage;
  name: string;
  code?: string | null;
  releaseDate?: string | null;
  cardCountOfficial: number;
  cardCountTotal: number;
  cardCountHolo?: number | null;
  cardCountReverse?: number | null;
  cardCountFirstEd?: number | null;
  logoUrl?: string | null;
  symbolUrl?: string | null;
  legalStandard?: boolean;
  legalExpanded?: boolean;
}

export interface ProviderVariant {
  /** Stable identifier from the provider, when it has one. */
  providerVariantId?: string | null;
  type: VariantType;
  size: string;
  cardmarketProductId?: number | null;
  tcgplayerProductId?: number | null;
  /** Raw pricing payload, handed to the pricing provider unchanged. */
  rawPricing?: unknown;
}

export interface ProviderCard {
  id: string;
  setId: string;
  localId: string;
  name: string;
  category: string;
  rarity?: string | null;
  illustrator?: string | null;
  hp?: number | null;
  types: string[];
  stage?: string | null;
  evolveFrom?: string | null;
  regulationMark?: string | null;
  dexIds: number[];
  imageBaseUrl?: string | null;
  providerUpdatedAt?: string | null;
  variants: ProviderVariant[];
  extra?: Record<string, unknown>;
}

/** A card as it appears in one printed language. */
export interface ProviderCardTranslation {
  cardId: string;
  language: CardLanguage;
  name: string;
  localId?: string | null;
  imageBaseUrl?: string | null;
}

export interface ProviderSetTranslation {
  setId: string;
  language: CardLanguage;
  name: string;
  logoUrl?: string | null;
  symbolUrl?: string | null;
  cardCountOfficial?: number | null;
  cardCountTotal?: number | null;
  cards: ProviderCardTranslation[];
}

export interface CatalogProvider {
  readonly key: string;
  readonly displayName: string;
  /** Printed languages this provider can supply. */
  readonly languages: readonly CardLanguage[];

  listSeries(language?: CardLanguage): Promise<ProviderSeries[]>;
  listSets(language?: CardLanguage): Promise<ProviderSet[]>;
  /** Card ids belonging to a set, in printed order. */
  listCardIds(setId: string, language?: CardLanguage): Promise<string[]>;
  getCard(cardId: string, language?: CardLanguage): Promise<ProviderCard | null>;
  /**
   * Set ids that exist in this language. Cheap: one request.
   * Used to find releases that have no western equivalent.
   */
  listSetIdsForLanguage(language: CardLanguage): Promise<string[]>;
  /** One request per (set, language); returns null when the set is not printed in it. */
  getSetTranslation(
    setId: string,
    language: CardLanguage,
  ): Promise<ProviderSetTranslation | null>;
  /** Cheap liveness probe used by the admin data-source panel. */
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}
