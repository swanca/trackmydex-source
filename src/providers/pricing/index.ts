import { env } from '@/lib/env';
import {
  TcgdexCardmarketProvider,
  TcgdexTcgplayerProvider,
  fetchTcgdexPayloads,
  pricingBlockFor,
} from './tcgdex';
import { PokemonTcgIoProvider } from './pokemontcgio';
import type { PriceableVariant, PricingProvider } from './types';

export * from './types';

const registry = new Map<string, PricingProvider>();

export function registerPricingProvider(provider: PricingProvider): void {
  registry.set(provider.key, provider);
}

registerPricingProvider(new TcgdexCardmarketProvider());
registerPricingProvider(new TcgdexTcgplayerProvider());
registerPricingProvider(new PokemonTcgIoProvider());

/**
 * Providers enabled for this deployment, in preference order.
 *
 * `PRICING_PROVIDERS=tcgdex` (the default) enables both TCGdex-backed
 * marketplaces. A provider that declares `requiresApiKey` and is not configured
 * is filtered out, so the app never renders a price section that cannot work.
 */
export function getEnabledPricingProviders(): PricingProvider[] {
  const requested = env.PRICING_PROVIDERS;
  const enabled: PricingProvider[] = [];

  for (const key of requested) {
    if (key === 'tcgdex') {
      enabled.push(registry.get('tcgdex.cardmarket')!, registry.get('tcgdex.tcgplayer')!);
      continue;
    }
    const provider = registry.get(key);
    if (provider) enabled.push(provider);
  }

  return enabled.filter((p) => p.isConfigured());
}

export function getPricingProvider(key: string): PricingProvider | undefined {
  return registry.get(key);
}

export function listPricingProviders(): PricingProvider[] {
  return [...registry.values()];
}

/**
 * Preference order used when several providers priced the same printing.
 * Cardmarket first: the product is aimed at a European audience and Cardmarket is
 * the marketplace those users actually buy and sell on.
 */
export const PROVIDER_PREFERENCE = [
  'tcgdex.cardmarket',
  'tcgdex.tcgplayer',
  // Fills the gap TCGdex leaves on a freshly released set, where it publishes
  // the pricing keys with null values for days after launch.
  'tcgcsv.tcgplayer',
  'pokemontcgio',
];

/**
 * Shared card-payload sources.
 *
 * A source downloads one upstream document per card and exposes the slice of it
 * that describes a given printing. Every provider declaring the same
 * `payloadSource` is then served from a single fetch, which is what makes a
 * full-catalog price pass ~24,000 requests rather than one pass per provider.
 */
export interface PayloadSource {
  fetch(cardIds: readonly string[]): Promise<Map<string, unknown>>;
  blockFor(payload: unknown, variant: PriceableVariant): unknown;
}

const payloadSources: Record<string, PayloadSource> = {
  tcgdex: {
    fetch: async (cardIds) =>
      (await fetchTcgdexPayloads(cardIds)) as unknown as Map<string, unknown>,
    blockFor: (payload, variant) =>
      pricingBlockFor(payload as Parameters<typeof pricingBlockFor>[0], variant),
  },
};

export function getPayloadSource(key: string): PayloadSource | undefined {
  return payloadSources[key];
}
