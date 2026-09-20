import type { Currency, PriceConfidence, VariantType } from '@/db/schema/enums';

/**
 * Pricing provider abstraction.
 *
 * The brief requires that providers be replaceable without rewriting the app, and
 * that approximate valuations never masquerade as market prices. Both properties
 * are enforced by this interface: a provider can only ever emit a `PriceQuote`,
 * and a `PriceQuote` cannot exist without a `confidence` and, when approximate, a
 * machine-readable reason.
 */

export interface PriceQuote {
  /** Registry key, e.g. `tcgdex.cardmarket`. Stored verbatim on the price row. */
  provider: string;
  currency: Currency;

  /** Headline value. Null when the provider has no reading for this printing. */
  market: number | null;
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  trend?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  directLow?: number | null;

  confidence: PriceConfidence;
  /**
   * Required whenever `confidence` is `approximate`. Machine-readable so the UI
   * can translate it, e.g. `variant-substitution:reverse->normal`.
   */
  approximationReason?: string;

  sourceProductId?: string | null;
  sourceUrl?: string | null;
  fetchedAt: Date;
}

/** What the pricing layer needs to know about a printing in order to value it. */
export interface PriceableVariant {
  variantId: string;
  cardId: string;
  variantType: VariantType;
  size: string;
  cardmarketProductId: number | null;
  tcgplayerProductId: number | null;
}

export interface PricingProvider {
  readonly key: string;
  readonly displayName: string;
  /** Marketplace the numbers come from, shown next to every price. */
  readonly marketplace: string;
  readonly currency: Currency;
  /** Optional providers declare true and are skipped unless configured. */
  readonly requiresApiKey: boolean;

  /**
   * Name of the upstream card payload this provider reads prices out of.
   *
   * Providers that share a payload source are served by a single fetch per
   * card during a sync. That halves a full-catalog price pass from ~48,000
   * requests to ~24,000 when both the Cardmarket and TCGplayer readings come
   * out of the same TCGdex card document.
   *
   * Providers with their own price endpoint leave this undefined and do their
   * work in `fetchQuotes`.
   */
  readonly payloadSource?: string;

  isConfigured(): boolean;

  /**
   * Derive quotes from a payload the catalog sync already downloaded.
   *
   * Providers that embed prices in the card document (TCGdex) implement this and
   * cost zero extra requests. Providers with a separate price endpoint return an
   * empty array here and do their work in `fetchQuotes`.
   */
  fromCatalogPayload(variant: PriceableVariant, rawPricing: unknown): PriceQuote[];

  /** Fetch quotes for a batch of printings. Implementations must respect limits. */
  fetchQuotes(variants: readonly PriceableVariant[]): Promise<Map<string, PriceQuote[]>>;

  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}

/** Reasons a quote can be approximate, kept as constants so the UI can translate. */
export const APPROX = {
  variantSubstitution: (from: string, to: string) => `variant-substitution:${from}->${to}`,
  languageSubstitution: (from: string, to: string) => `language-substitution:${from}->${to}`,
  conditionAdjusted: (condition: string) => `condition-adjusted:${condition}`,
  currencyConverted: (from: string, to: string) => `currency-converted:${from}->${to}`,
} as const;
