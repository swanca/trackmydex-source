import { TcgdexCatalogProvider } from './tcgdex';
import type { CatalogProvider } from './types';

export * from './types';
export { TcgdexCatalogProvider };

const registry = new Map<string, CatalogProvider>();

export function registerCatalogProvider(provider: CatalogProvider): void {
  registry.set(provider.key, provider);
}

registerCatalogProvider(new TcgdexCatalogProvider());

export function getCatalogProvider(key = 'tcgdex'): CatalogProvider {
  const provider = registry.get(key);
  if (!provider) {
    throw new Error(
      `Unknown catalog provider "${key}". Registered: ${[...registry.keys()].join(', ')}`,
    );
  }
  return provider;
}

export function listCatalogProviders(): CatalogProvider[] {
  return [...registry.values()];
}
