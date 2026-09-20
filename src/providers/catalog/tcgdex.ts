import { env } from '@/lib/env';
import { fetchJson, mapWithConcurrency } from '@/lib/http';
import { decodeLocalId } from '@/lib/catalog/sort';
import { EXCLUDED_SERIES } from '@/lib/catalog/eras';
import { CARD_LANGUAGES, type CardLanguage, type VariantType } from '@/db/schema/enums';
import type {
  CatalogProvider,
  ProviderCard,
  ProviderSeries,
  ProviderSet,
  ProviderSetTranslation,
  ProviderVariant,
} from './types';

/**
 * TCGdex catalog provider - the default and only zero-configuration source.
 *
 * Chosen because it is the one free API that covers every era in every printed
 * language *and* carries the Cardmarket / TCGplayer product ids we need for exact
 * market links. See docs/ARCHITECTURE.md section 1 for the full comparison.
 *
 * Quirks handled here, all verified against the live API:
 *  - `/sets` omits `serie` and `releaseDate`, so sets are discovered through the
 *    series endpoints and then fetched individually.
 *  - Some card ids are percent-encoded (`exu-%3F`, the `?` Unown).
 *  - `symbol` assets currently 400 from the upstream bucket; we still store the
 *    URL and let the UI fall back rather than dropping the field.
 *  - Older cards predate `variants_detailed`, so the boolean `variants` object is
 *    used as a fallback.
 */

interface TcgdexBrief {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  image?: string;
  localId?: string;
  cardCount?: { total?: number; official?: number };
}

interface TcgdexSeriesDetail extends TcgdexBrief {
  sets?: TcgdexBrief[];
}

interface TcgdexSetDetail extends TcgdexBrief {
  serie?: { id: string; name: string };
  releaseDate?: string;
  legal?: { standard?: boolean; expanded?: boolean };
  abbreviation?: { official?: string; localized?: string };
  tcgOnline?: string;
  cardCount?: {
    total?: number;
    official?: number;
    holo?: number;
    reverse?: number;
    firstEd?: number;
    normal?: number;
  };
  cards?: TcgdexBrief[];
}

interface TcgdexDetailedVariant {
  type?: string;
  size?: string;
  variantId?: string;
  thirdParty?: { cardmarket?: number; tcgplayer?: number };
  pricing?: unknown;
}

interface TcgdexCardDetail {
  id: string;
  localId: string;
  name: string;
  category?: string;
  rarity?: string;
  illustrator?: string;
  image?: string;
  hp?: number;
  types?: string[];
  stage?: string;
  evolveFrom?: string;
  regulationMark?: string;
  dexId?: number[];
  updated?: string;
  description?: string;
  suffix?: string;
  set?: { id: string };
  variants?: Record<string, boolean>;
  variants_detailed?: TcgdexDetailedVariant[];
  pricing?: unknown;
  attacks?: unknown;
  abilities?: unknown;
  weaknesses?: unknown;
  resistances?: unknown;
  retreat?: number;
  trainerType?: string;
  energyType?: string;
  legal?: { standard?: boolean; expanded?: boolean };
}

const VARIANT_TYPE_MAP: Record<string, VariantType> = {
  normal: 'normal',
  holo: 'holo',
  reverse: 'reverse',
  firstedition: 'firstEdition',
  'first-edition': 'firstEdition',
  firsteditionholo: 'firstEditionHolo',
  unlimited: 'unlimited',
  wpromo: 'wPromo',
  promo: 'wPromo',
};

/**
 * National Pokedex numbers, normalised to whole species numbers.
 *
 * TCGdex uses a fractional id for alternate formes - the Gold Star Rayquaza in
 * PCG2 is `384.1`. The dex column is an `integer[]` because its whole purpose
 * is "show me every Pikachu card", and 384.1 and 384 are both Rayquaza, so the
 * base number is the correct thing to index. Left unhandled this is not a
 * cosmetic issue: Postgres rejects the whole insert batch with SQLSTATE 22P02
 * and the set fails to import.
 */
function toDexIds(raw: number[] | undefined): number[] {
  if (!raw) return [];
  const out: number[] = [];
  for (const value of raw) {
    const base = Math.floor(Number(value));
    if (Number.isFinite(base) && base > 0 && !out.includes(base)) out.push(base);
  }
  return out;
}

function toVariantType(raw: string | undefined): VariantType {
  if (!raw) return 'other';
  return VARIANT_TYPE_MAP[raw.toLowerCase().replace(/[\s_]/g, '')] ?? 'other';
}

export class TcgdexCatalogProvider implements CatalogProvider {
  readonly key = 'tcgdex';
  readonly displayName = 'TCGdex';
  readonly languages = CARD_LANGUAGES;

  constructor(private readonly baseUrl: string = env.TCGDEX_API_URL) {}

  private url(language: CardLanguage, path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/${language}/${path}`;
  }

  async listSeries(language: CardLanguage = 'en'): Promise<ProviderSeries[]> {
    const raw = (await fetchJson<TcgdexBrief[]>(this.url(language, 'series'))) ?? [];
    return raw
      .filter((s) => !EXCLUDED_SERIES.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, logoUrl: s.logo ?? null }));
  }

  /**
   * Sets are resolved series by series because the flat `/sets` listing carries
   * neither the parent series nor the release date.
   */
  async listSets(language: CardLanguage = 'en'): Promise<ProviderSet[]> {
    const series = await this.listSeries(language);

    // Series first, then every set detail, both with bounded concurrency.
    // Done sequentially this is ~600 round trips across all languages and adds
    // minutes to the front of every sync before a single card is fetched.
    const seriesDetails = await mapWithConcurrency(series, env.SYNC_CONCURRENCY, async (serie) => {
      const detail = await fetchJson<TcgdexSeriesDetail>(
        this.url(language, `series/${encodeURIComponent(serie.id)}`),
        { allowNotFound: true },
      );
      return { serieId: serie.id, sets: detail?.sets ?? [] };
    });

    const pending: Array<{ serieId: string; setId: string }> = [];
    for (const result of seriesDetails) {
      if (!result.ok) continue;
      for (const brief of result.value.sets) {
        pending.push({ serieId: result.value.serieId, setId: brief.id });
      }
    }

    const details = await mapWithConcurrency(pending, env.SYNC_CONCURRENCY, async (item) => {
      const full = await fetchJson<TcgdexSetDetail>(
        this.url(language, `sets/${encodeURIComponent(item.setId)}`),
        { allowNotFound: true },
      );
      return full ? this.toProviderSet(full, item.serieId, language) : null;
    });

    const sets: ProviderSet[] = [];
    for (const result of details) {
      if (result.ok && result.value) sets.push(result.value);
    }
    return sets;
  }

  /** One request. Used to spot releases that exist only outside the west. */
  async listSetIdsForLanguage(language: CardLanguage): Promise<string[]> {
    const raw = (await fetchJson<TcgdexBrief[]>(this.url(language, 'sets'), {
      allowNotFound: true,
    })) ?? [];
    return raw.map((s) => s.id);
  }

  private toProviderSet(
    raw: TcgdexSetDetail,
    fallbackSeriesId: string,
    originLanguage: CardLanguage = 'en',
  ): ProviderSet {
    return {
      id: raw.id,
      seriesId: raw.serie?.id ?? fallbackSeriesId,
      originLanguage,
      name: raw.name,
      code: raw.abbreviation?.official ?? raw.tcgOnline ?? null,
      releaseDate: raw.releaseDate ?? null,
      cardCountOfficial: raw.cardCount?.official ?? 0,
      cardCountTotal: raw.cardCount?.total ?? raw.cardCount?.official ?? 0,
      cardCountHolo: raw.cardCount?.holo ?? null,
      cardCountReverse: raw.cardCount?.reverse ?? null,
      cardCountFirstEd: raw.cardCount?.firstEd ?? null,
      logoUrl: raw.logo ?? null,
      symbolUrl: raw.symbol ?? null,
      legalStandard: raw.legal?.standard ?? false,
      legalExpanded: raw.legal?.expanded ?? false,
    };
  }

  async listCardIds(setId: string, language: CardLanguage = 'en'): Promise<string[]> {
    const detail = await fetchJson<TcgdexSetDetail>(
      this.url(language, `sets/${encodeURIComponent(setId)}`),
      { allowNotFound: true },
    );
    return (detail?.cards ?? []).map((c) => c.id);
  }

  async getCard(cardId: string, language: CardLanguage = 'en'): Promise<ProviderCard | null> {
    const raw = await fetchJson<TcgdexCardDetail>(
      this.url(language, `cards/${encodeURIComponent(cardId)}`),
      { allowNotFound: true },
    );
    if (!raw) return null;

    return {
      id: raw.id,
      setId: raw.set?.id ?? cardId.split('-')[0] ?? '',
      localId: decodeLocalId(raw.localId ?? ''),
      name: raw.name,
      category: raw.category ?? 'Pokemon',
      rarity: raw.rarity ?? null,
      illustrator: raw.illustrator ?? null,
      hp: raw.hp ?? null,
      types: raw.types ?? [],
      stage: raw.stage ?? null,
      evolveFrom: raw.evolveFrom ?? null,
      regulationMark: raw.regulationMark ?? null,
      dexIds: toDexIds(raw.dexId),
      imageBaseUrl: raw.image ?? null,
      providerUpdatedAt: raw.updated ?? null,
      variants: this.toVariants(raw),
      extra: {
        description: raw.description,
        suffix: raw.suffix,
        attacks: raw.attacks,
        abilities: raw.abilities,
        weaknesses: raw.weaknesses,
        resistances: raw.resistances,
        retreat: raw.retreat,
        trainerType: raw.trainerType,
        energyType: raw.energyType,
        legal: raw.legal,
      },
    };
  }

  private toVariants(raw: TcgdexCardDetail): ProviderVariant[] {
    const detailed = raw.variants_detailed ?? [];

    if (detailed.length > 0) {
      const seen = new Set<string>();
      const out: ProviderVariant[] = [];
      for (const v of detailed) {
        const type = toVariantType(v.type);
        /**
         * Lower-cased on the way in.
         *
         * The uniqueness of a printing is (card, type, size), so upstream
         * sending "Standard" where it usually sends "standard" would create
         * a second row for a printing that already exists - two entries for
         * one card in every picker, and a collection split across them. It
         * has already shipped 172 rows the other way; those are harmless
         * only because no card has both spellings yet.
         */
        const size = (v.size ?? 'standard').toLowerCase();
        const dedupeKey = `${type}:${size}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push({
          providerVariantId: v.variantId ?? null,
          type,
          size,
          cardmarketProductId: v.thirdParty?.cardmarket ?? null,
          tcgplayerProductId: v.thirdParty?.tcgplayer ?? null,
          rawPricing: v.pricing ?? raw.pricing ?? null,
        });
      }
      return out;
    }

    // Fallback for cards that predate `variants_detailed`.
    const flags = raw.variants ?? {};
    const out: ProviderVariant[] = [];
    for (const [flag, enabled] of Object.entries(flags)) {
      if (!enabled) continue;
      out.push({
        providerVariantId: null,
        type: toVariantType(flag),
        size: 'standard',
        cardmarketProductId: null,
        tcgplayerProductId: null,
        rawPricing: raw.pricing ?? null,
      });
    }
    // Every card must have at least one purchasable printing.
    if (out.length === 0) {
      out.push({
        providerVariantId: null,
        type: 'normal',
        size: 'standard',
        rawPricing: raw.pricing ?? null,
      });
    }
    return out;
  }

  /**
   * One request returns every card of the set in that language, which is what
   * makes translating 16 languages cost ~1,800 requests instead of ~380,000.
   */
  async getSetTranslation(
    setId: string,
    language: CardLanguage,
  ): Promise<ProviderSetTranslation | null> {
    const raw = await fetchJson<TcgdexSetDetail>(
      this.url(language, `sets/${encodeURIComponent(setId)}`),
      { allowNotFound: true },
    );
    if (!raw) return null;

    return {
      setId,
      language,
      name: raw.name,
      logoUrl: raw.logo ?? null,
      symbolUrl: raw.symbol ?? null,
      cardCountOfficial: raw.cardCount?.official ?? null,
      cardCountTotal: raw.cardCount?.total ?? null,
      cards: (raw.cards ?? []).map((c) => ({
        cardId: c.id,
        language,
        name: c.name,
        localId: c.localId ? decodeLocalId(c.localId) : null,
        imageBaseUrl: c.image ?? null,
      })),
    };
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const started = Date.now();
      const series = await fetchJson<TcgdexBrief[]>(this.url('en', 'series'), {
        retries: 1,
        timeoutMs: 8_000,
      });
      const ms = Date.now() - started;
      if (!series?.length) return { ok: false, detail: 'Empty series listing' };
      return { ok: true, detail: `${series.length} series in ${ms}ms` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
