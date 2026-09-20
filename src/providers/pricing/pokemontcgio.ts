import { env } from '@/lib/env';
import { fetchJson, mapWithConcurrency } from '@/lib/http';
import { tcgplayerProductUrl } from '@/lib/pricing/links';
import type { Currency, VariantType } from '@/db/schema/enums';
import { APPROX, type PriceQuote, type PriceableVariant, type PricingProvider } from './types';

/**
 * pokemontcg.io - optional secondary pricing provider.
 *
 * Kept deliberately optional. During research (2026-09-19) `GET /v2/sets`
 * returned HTTP 500, so this provider is disabled unless a self-hoster opts in by
 * listing `pokemontcgio` in PRICING_PROVIDERS. It exists to prove the abstraction
 * is real: adding a source is a file, a registry line and an env flag.
 *
 * Its card ids happen to share TCGdex's `{set}-{number}` convention for modern
 * sets but diverge on older ones, so a mapping miss is reported rather than
 * guessed at.
 */

interface PtcgioPrices {
  low?: number;
  mid?: number;
  high?: number;
  market?: number;
  directLow?: number;
}

interface PtcgioCard {
  id: string;
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, PtcgioPrices>;
  };
  cardmarket?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, number>;
  };
}

const FINISH_BY_VARIANT: Record<VariantType, string[]> = {
  normal: ['normal'],
  holo: ['holofoil'],
  reverse: ['reverseHolofoil'],
  firstEdition: ['1stEditionNormal', '1stEdition'],
  firstEditionHolo: ['1stEditionHolofoil'],
  unlimited: ['unlimited', 'normal'],
  wPromo: ['normal', 'holofoil'],
  other: ['normal', 'holofoil'],
};

export class PokemonTcgIoProvider implements PricingProvider {
  readonly key = 'pokemontcgio';
  readonly displayName = 'pokemontcg.io';
  readonly marketplace = 'TCGplayer';
  readonly currency: Currency = 'USD';
  readonly requiresApiKey = false;

  isConfigured(): boolean {
    return env.PRICING_PROVIDERS.includes('pokemontcgio');
  }

  /** Prices are not embedded in our catalog payload, so nothing to derive offline. */
  fromCatalogPayload(): PriceQuote[] {
    return [];
  }

  async fetchQuotes(variants: readonly PriceableVariant[]): Promise<Map<string, PriceQuote[]>> {
    const out = new Map<string, PriceQuote[]>();
    if (!this.isConfigured()) return out;

    const byCard = new Map<string, PriceableVariant[]>();
    for (const v of variants) {
      const list = byCard.get(v.cardId) ?? [];
      list.push(v);
      byCard.set(v.cardId, list);
    }

    const headers = env.POKEMONTCGIO_API_KEY
      ? { 'X-Api-Key': env.POKEMONTCGIO_API_KEY }
      : undefined;

    const results = await mapWithConcurrency([...byCard.keys()], 4, async (cardId) => {
      const payload = await fetchJson<{ data?: PtcgioCard }>(
        `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(cardId)}`,
        { allowNotFound: true, ...(headers ? { headers } : {}) },
      );
      return { cardId, card: payload?.data ?? null };
    });

    for (const result of results) {
      if (!result.ok || !result.value.card) continue;
      const { cardId, card } = result.value;
      const fetchedAt = card.tcgplayer?.updatedAt ? new Date(card.tcgplayer.updatedAt) : new Date();

      for (const variant of byCard.get(cardId) ?? []) {
        const candidates = FINISH_BY_VARIANT[variant.variantType] ?? ['normal'];
        const prices = card.tcgplayer?.prices ?? {};
        let chosen: PtcgioPrices | undefined;
        let index = -1;
        for (const [i, key] of candidates.entries()) {
          if (prices[key]) {
            chosen = prices[key];
            index = i;
            break;
          }
        }
        if (!chosen) continue;
        const market = chosen.market ?? chosen.mid ?? null;
        if (market === null) continue;

        const exact = index === 0;
        out.set(variant.variantId, [
          {
            provider: this.key,
            currency: 'USD',
            market,
            low: chosen.low ?? null,
            mid: chosen.mid ?? null,
            high: chosen.high ?? null,
            directLow: chosen.directLow ?? null,
            confidence: exact ? 'exact' : 'approximate',
            ...(exact
              ? {}
              : {
                  approximationReason: APPROX.variantSubstitution(
                    variant.variantType,
                    candidates[index] ?? 'normal',
                  ),
                }),
            sourceProductId: variant.tcgplayerProductId ? String(variant.tcgplayerProductId) : null,
            sourceUrl:
              card.tcgplayer?.url ??
              (variant.tcgplayerProductId ? tcgplayerProductUrl(variant.tcgplayerProductId) : null),
            fetchedAt,
          },
        ]);
      }
    }

    return out;
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.isConfigured()) return { ok: false, detail: 'Not enabled in PRICING_PROVIDERS' };
    try {
      await fetchJson('https://api.pokemontcg.io/v2/sets?pageSize=1', {
        retries: 1,
        timeoutMs: 8_000,
      });
      return { ok: true, detail: 'Reachable' };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
