import { env } from '@/lib/env';
import { fetchJson } from '@/lib/http';
import { mapWithConcurrency } from '@/lib/http';
import { tcgplayerProductUrl } from '@/lib/pricing/links';
import type { Currency, VariantType } from '@/db/schema/enums';
import { APPROX, type PriceQuote, type PriceableVariant, type PricingProvider } from './types';

/**
 * TCGdex embedded pricing.
 *
 * TCGdex republishes daily Cardmarket aggregates and TCGplayer per-finish
 * aggregates inside the card document, keyed by the exact marketplace product id.
 * That makes it the only free way to show real market signal for every era and to
 * link to a real Cardmarket product rather than a fabricated search URL.
 *
 * The two marketplaces are exposed as two separate providers
 * (`tcgdex.cardmarket`, `tcgdex.tcgplayer`) because they use different currencies
 * and different price semantics, and the user must be told which one they are
 * looking at.
 */

interface CardmarketPricing {
  updated?: string;
  unit?: string;
  idProduct?: number;
  avg?: number;
  low?: number;
  trend?: number;
  avg1?: number;
  avg7?: number;
  avg30?: number;
  'avg-holo'?: number;
  'low-holo'?: number;
  'trend-holo'?: number;
  'avg1-holo'?: number;
  'avg7-holo'?: number;
  'avg30-holo'?: number;
  [key: string]: unknown;
}

interface TcgplayerFinish {
  productId?: number;
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
  marketPrice?: number;
  directLowPrice?: number;
}

interface TcgplayerPricing {
  unit?: string;
  updated?: string;
  [finish: string]: TcgplayerFinish | string | undefined;
}

interface TcgdexPricingBlock {
  cardmarket?: CardmarketPricing;
  tcgplayer?: TcgplayerPricing;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/**
 * Cardmarket publishes one product per card, with a second set of `-holo` price
 * points that describe the reverse-holo printing of that same product. Mapping a
 * reverse holo onto the plain fields would understate it by several multiples on
 * many cards, so each printing reads the fields that actually describe it.
 */
function cardmarketFieldsFor(variantType: VariantType): {
  suffix: '' | '-holo';
  exact: boolean;
  reason?: string;
} {
  switch (variantType) {
    case 'reverse':
      return { suffix: '-holo', exact: true };
    case 'normal':
    case 'unlimited':
      return { suffix: '', exact: true };
    case 'holo':
      return { suffix: '', exact: true };
    case 'firstEdition':
    case 'firstEditionHolo':
      // Cardmarket lists 1st edition as its own product for most sets; when the
      // catalog gives us the base product id instead, the reading is indicative.
      return { suffix: '', exact: false, reason: APPROX.variantSubstitution('firstEdition', 'normal') };
    case 'wPromo':
      return { suffix: '', exact: true };
    default:
      return { suffix: '', exact: false, reason: APPROX.variantSubstitution('other', 'normal') };
  }
}

/** TCGplayer finish keys, normalised: TCGdex kebab-cases them inconsistently. */
const TCGPLAYER_FINISHES: Record<VariantType, string[]> = {
  normal: ['normal'],
  holo: ['holofoil', 'holo'],
  reverse: ['reverseholofoil', 'reverse'],
  firstEdition: ['1steditionnormal', '1stedition', 'firstedition'],
  firstEditionHolo: ['1steditionholofoil', '1steditionholo'],
  unlimited: ['unlimited', 'unlimitedholofoil', 'normal'],
  wPromo: ['normal', 'holofoil'],
  other: ['normal', 'holofoil'],
};

const normaliseKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export class TcgdexCardmarketProvider implements PricingProvider {
  readonly key = 'tcgdex.cardmarket';
  readonly displayName = 'Cardmarket (via TCGdex)';
  readonly marketplace = 'Cardmarket';
  readonly currency: Currency = 'EUR';
  readonly requiresApiKey = false;
  readonly payloadSource = 'tcgdex';

  isConfigured(): boolean {
    return true;
  }

  fromCatalogPayload(variant: PriceableVariant, rawPricing: unknown): PriceQuote[] {
    const block = (rawPricing ?? {}) as TcgdexPricingBlock;
    const cm = block.cardmarket;
    if (!cm) return [];

    const { suffix, exact, reason } = cardmarketFieldsFor(variant.variantType);
    const read = (base: string) => num(cm[`${base}${suffix}` as keyof CardmarketPricing]);

    // A reverse holo with no `-holo` reading falls back to the base product and is
    // explicitly downgraded to approximate rather than silently reported as exact.
    let confidence: PriceQuote['confidence'] = exact ? 'exact' : 'approximate';
    let approximationReason = reason;
    let market = read('avg') ?? read('trend');
    let low = read('low');
    let trend = read('trend');
    let avg1 = read('avg1');
    let avg7 = read('avg7');
    let avg30 = read('avg30');

    if (market === null && suffix === '-holo') {
      market = num(cm.avg) ?? num(cm.trend);
      low = num(cm.low);
      trend = num(cm.trend);
      avg1 = num(cm.avg1);
      avg7 = num(cm.avg7);
      avg30 = num(cm.avg30);
      if (market !== null) {
        confidence = 'approximate';
        approximationReason = APPROX.variantSubstitution('reverse', 'normal');
      }
    }

    if (market === null) return [];

    const productId = variant.cardmarketProductId ?? cm.idProduct ?? null;

    return [
      {
        provider: this.key,
        currency: 'EUR',
        market,
        low,
        trend,
        avg1,
        avg7,
        avg30,
        confidence,
        ...(confidence === 'approximate' && approximationReason
          ? { approximationReason }
          : {}),
        sourceProductId: productId ? String(productId) : null,
        // Cardmarket has no id-addressable product page, so there is no exact
        // URL to store. The UI builds a scoped search from the card's own name
        // and number instead, where the display locale is known.
        sourceUrl: null,
        fetchedAt: cm.updated ? new Date(cm.updated) : new Date(),
      },
    ];
  }

  async fetchQuotes(variants: readonly PriceableVariant[]): Promise<Map<string, PriceQuote[]>> {
    return fetchTcgdexPricing(variants, (variant, raw) => this.fromCatalogPayload(variant, raw));
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    return probeTcgdexPricing('cardmarket');
  }
}

export class TcgdexTcgplayerProvider implements PricingProvider {
  readonly key = 'tcgdex.tcgplayer';
  readonly displayName = 'TCGplayer (via TCGdex)';
  readonly marketplace = 'TCGplayer';
  readonly currency: Currency = 'USD';
  readonly requiresApiKey = false;
  readonly payloadSource = 'tcgdex';

  isConfigured(): boolean {
    return true;
  }

  fromCatalogPayload(variant: PriceableVariant, rawPricing: unknown): PriceQuote[] {
    const block = (rawPricing ?? {}) as TcgdexPricingBlock;
    const tp = block.tcgplayer;
    if (!tp) return [];

    const byKey = new Map<string, TcgplayerFinish>();
    for (const [key, value] of Object.entries(tp)) {
      if (value && typeof value === 'object') byKey.set(normaliseKey(key), value as TcgplayerFinish);
    }

    const candidates = TCGPLAYER_FINISHES[variant.variantType] ?? ['normal'];
    let finish: TcgplayerFinish | undefined;
    let usedIndex = -1;
    for (const [i, candidate] of candidates.entries()) {
      const hit = byKey.get(normaliseKey(candidate));
      if (hit) {
        finish = hit;
        usedIndex = i;
        break;
      }
    }
    if (!finish) return [];

    const market = num(finish.marketPrice) ?? num(finish.midPrice);
    if (market === null) return [];

    // Index 0 is the finish that actually matches this printing; anything after it
    // is a documented substitution.
    const exact = usedIndex === 0;
    const productId = variant.tcgplayerProductId ?? finish.productId ?? null;

    return [
      {
        provider: this.key,
        currency: 'USD',
        market,
        low: num(finish.lowPrice),
        mid: num(finish.midPrice),
        high: num(finish.highPrice),
        directLow: num(finish.directLowPrice),
        confidence: exact ? 'exact' : 'approximate',
        ...(exact
          ? {}
          : {
              approximationReason: APPROX.variantSubstitution(
                variant.variantType,
                candidates[usedIndex] ?? 'normal',
              ),
            }),
        sourceProductId: productId ? String(productId) : null,
        sourceUrl: productId ? tcgplayerProductUrl(productId) : null,
        fetchedAt: typeof tp.updated === 'string' ? new Date(tp.updated) : new Date(),
      },
    ];
  }

  async fetchQuotes(variants: readonly PriceableVariant[]): Promise<Map<string, PriceQuote[]>> {
    return fetchTcgdexPricing(variants, (variant, raw) => this.fromCatalogPayload(variant, raw));
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    return probeTcgdexPricing('tcgplayer');
  }
}

/**
 * Downloads TCGdex card documents and indexes the pricing blocks by printing.
 *
 * Exported so the sync layer can fetch each card exactly once and hand the same
 * payload to both TCGdex-backed providers. Prices live inside the card
 * document, so one request serves every printing of that card in both
 * marketplaces.
 */
export async function fetchTcgdexPayloads(
  cardIds: readonly string[],
): Promise<Map<string, TcgdexCardPayload>> {
  const out = new Map<string, TcgdexCardPayload>();

  const results = await mapWithConcurrency(cardIds, env.SYNC_CONCURRENCY, async (cardId) => {
    const raw = await fetchJson<TcgdexCardPayload>(
      `${env.TCGDEX_API_URL.replace(/\/$/, '')}/en/cards/${encodeURIComponent(cardId)}`,
      { allowNotFound: true },
    );
    return { cardId, raw };
  });

  for (const result of results) {
    if (result.ok && result.value.raw) out.set(result.value.cardId, result.value.raw);
  }
  return out;
}

export interface TcgdexCardPayload {
  pricing?: TcgdexPricingBlock;
  variants_detailed?: Array<{ type?: string; size?: string; pricing?: TcgdexPricingBlock }>;
}

/**
 * Picks the pricing block that describes this exact printing, falling back to
 * the card-level block for older cards that predate `variants_detailed`.
 */
export function pricingBlockFor(
  payload: TcgdexCardPayload | undefined,
  variant: PriceableVariant,
): unknown {
  if (!payload) return null;
  const own = (payload.variants_detailed ?? []).find(
    (d) =>
      normaliseKey(d.type ?? '') === normaliseKey(variant.variantType) &&
      (d.size ?? 'standard') === variant.size,
  );
  return own?.pricing ?? payload.pricing ?? null;
}

/**
 * Standalone path, used when a provider is driven directly rather than through
 * the shared-payload sync.
 */
async function fetchTcgdexPricing(
  variants: readonly PriceableVariant[],
  extract: (variant: PriceableVariant, rawPricing: unknown) => PriceQuote[],
): Promise<Map<string, PriceQuote[]>> {
  const byCard = new Map<string, PriceableVariant[]>();
  for (const variant of variants) {
    const list = byCard.get(variant.cardId) ?? [];
    list.push(variant);
    byCard.set(variant.cardId, list);
  }

  const out = new Map<string, PriceQuote[]>();
  const payloads = await fetchTcgdexPayloads([...byCard.keys()]);

  for (const [cardId, variants2] of byCard) {
    const payload = payloads.get(cardId);
    if (!payload) continue;
    for (const variant of variants2) {
      const quotes = extract(variant, pricingBlockFor(payload, variant));
      if (quotes.length > 0) out.set(variant.variantId, quotes);
    }
  }

  return out;
}

async function probeTcgdexPricing(
  marketplace: 'cardmarket' | 'tcgplayer',
): Promise<{ ok: boolean; detail: string }> {
  try {
    const raw = await fetchJson<{ pricing?: TcgdexPricingBlock }>(
      `${env.TCGDEX_API_URL.replace(/\/$/, '')}/en/cards/swsh3-136`,
      { retries: 1, timeoutMs: 8_000, allowNotFound: true },
    );
    const block = raw?.pricing?.[marketplace];
    if (!block) return { ok: false, detail: `No ${marketplace} block on the probe card` };
    const updated = (block as { updated?: string }).updated;
    return { ok: true, detail: updated ? `Last upstream update ${updated}` : 'Reachable' };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Unknown error' };
  }
}
