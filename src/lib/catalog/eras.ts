/**
 * Eras are ours, not the provider's.
 *
 * TCGdex exposes series (base, neo, ex, swsh...) but collectors navigate by era.
 * The brief asks for Era -> Series -> Set -> Cards, so this file is the single
 * place that defines the top level. Adding a future era is one entry here plus
 * one line in SERIES_TO_ERA.
 */
export interface EraDefinition {
  id: string;
  name: string;
  startYear: number;
  endYear: number | null;
  sortOrder: number;
}

export const ERAS: readonly EraDefinition[] = [
  { id: 'wotc', name: 'Wizards of the Coast', startYear: 1999, endYear: 2003, sortOrder: 10 },
  { id: 'ex', name: 'EX', startYear: 2003, endYear: 2007, sortOrder: 20 },
  { id: 'dp', name: 'Diamond & Pearl', startYear: 2007, endYear: 2010, sortOrder: 30 },
  { id: 'hgss', name: 'HeartGold & SoulSilver', startYear: 2010, endYear: 2011, sortOrder: 40 },
  { id: 'bw', name: 'Black & White', startYear: 2011, endYear: 2013, sortOrder: 50 },
  { id: 'xy', name: 'XY', startYear: 2013, endYear: 2016, sortOrder: 60 },
  { id: 'sm', name: 'Sun & Moon', startYear: 2016, endYear: 2019, sortOrder: 70 },
  { id: 'swsh', name: 'Sword & Shield', startYear: 2019, endYear: 2022, sortOrder: 80 },
  { id: 'sv', name: 'Scarlet & Violet', startYear: 2023, endYear: 2025, sortOrder: 90 },
  { id: 'me', name: 'Mega Evolution', startYear: 2025, endYear: null, sortOrder: 100 },
  { id: 'special', name: 'Promos & special releases', startYear: 1999, endYear: null, sortOrder: 110 },
] as const;

/**
 * Series id (as published by the catalog provider) -> era id.
 * Anything unmapped falls back to `special`, which is where promos, trainer kits
 * and one-off collaborations belong anyway.
 */
export const SERIES_TO_ERA: Record<string, string> = {
  base: 'wotc',
  gym: 'wotc',
  neo: 'wotc',
  lc: 'wotc',
  ecard: 'wotc',
  ex: 'ex',
  pop: 'ex',
  dp: 'dp',
  pl: 'dp',
  hgss: 'hgss',
  col: 'hgss',
  bw: 'bw',
  xy: 'xy',
  sm: 'sm',
  swsh: 'swsh',
  sv: 'sv',
  me: 'me',
  tk: 'special',
  mc: 'special',
  misc: 'special',
};

export const DEFAULT_ERA_ID = 'special';

export function eraForSeries(seriesId: string): string {
  return SERIES_TO_ERA[seriesId] ?? DEFAULT_ERA_ID;
}

/**
 * Series excluded from ingestion by default.
 *
 * `tcgp` is Pokemon TCG Pocket: a digital-only game. Its "cards" have no physical
 * printing, no condition, no Cardmarket product and therefore no market value, so
 * mixing them into a portfolio would corrupt every total on the dashboard.
 * Set CATALOG_INCLUDE_DIGITAL=true to ingest them anyway.
 */
export const EXCLUDED_SERIES = new Set(['tcgp']);

/**
 * Language naming lives in `./languages.ts`.
 *
 * Re-exported here so existing imports keep working; new code should import
 * from `@/lib/catalog/languages` directly.
 */
export {
  UI_LOCALES,
  UI_LOCALE_NAMES,
  LANGUAGE_LABELS,
  LANGUAGE_SHORT,
  LOCALE_DEFAULT_CARD_LANGUAGE,
  toUiLocale,
  type UiLocale,
} from './languages';

/**
 * Era names, translated.
 *
 * The names above are identifiers as much as labels: they seed the database
 * on sync and must stay stable. What a reader sees is a different matter -
 * `series_translation` is empty upstream, so a French interface was showing
 * "Sword & Shield" above its French set names. A taxonomy we invented belongs
 * in the message catalogue rather than in a table we would have to keep
 * translated by hand on every sync.
 *
 * The stored name is the fallback, so an era added later still renders
 * something real instead of a missing-key path.
 */
export type EraTranslator = {
  (key: string): string;
  has(key: string): boolean;
};

export function eraLabel(t: EraTranslator, eraId: string, fallback: string): string {
  const key = `eras.${eraId}`;
  return t.has(key) ? t(key) : fallback;
}
